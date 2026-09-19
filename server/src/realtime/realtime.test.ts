import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { dateIn } from "../lib/dates";
import { Crew, ensureIndexes, Job } from "../models";
import { closeRealtime, createRealtime } from "./io";
import { signTicket } from "./tickets";

const app = createApp();
const TZ = "America/Chicago";

let server: HttpServer;
let url: string;
const open: Socket[] = [];

/** Opens a socket and resolves once it is connected, or rejects if it is turned away. */
function socketWith(ticket: string): Promise<Socket> {
  const socket = connect(url, { auth: { ticket }, transports: ["websocket"], reconnection: false });
  open.push(socket);
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (error) => reject(error));
  });
}

/** The next event of this name, or null if nothing arrives in time. */
function nextEvent<T>(socket: Socket, name: string, waitMs = 1500): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), waitMs);
    socket.once(name, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function signIn(name: string): Promise<string> {
  const accounts = (await request(app).get("/api/auth/demo-accounts")).body as { staff: { id: string; name: string }[] };
  const person = accounts.staff.find((candidate) => candidate.name === name)!;
  const response = await request(app).post("/api/auth/demo").send({ userId: person.id });
  return response.headers["set-cookie"]![0]!.split(";")[0]!;
}

async function ticketFor(cookie?: string, portalToken?: string) {
  const call = request(app).post("/api/realtime/ticket");
  if (cookie) call.set("Cookie", cookie);
  return call.send(portalToken ? { portalToken } : {});
}

describe("live updates", () => {
  let mongo: MongoMemoryReplSet;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(mongo.getUri("kreworx_realtime_test"));
    await ensureIndexes();

    server = createServer(app);
    createRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await seedDemo();
  });

  afterEach(() => {
    for (const socket of open.splice(0)) socket.disconnect();
  });

  afterAll(async () => {
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    await mongo.stop();
  });

  describe("tickets", () => {
    it("gives signed-in staff a pass, and turns away a stranger", async () => {
      const staff = await ticketFor(await signIn("Dana Morales"));
      expect(staff.status).toBe(200);
      expect(staff.body.ticket).toEqual(expect.any(String));

      expect((await ticketFor()).status).toBe(401);
      expect((await ticketFor(undefined, "not-a-real-portal-token")).status).toBe(401);
    });

    it("gives the holder of a customer link a pass without any session", async () => {
      const osei = await Job.findOne({ number: 4471 }).lean();
      const response = await ticketFor(undefined, osei!.portalToken);
      expect(response.status).toBe(200);
    });

    it("watches the job, not the board, when a signed-in person opens a customer link", async () => {
      const osei = await Job.findOne({ number: 4471 }).lean();
      const dana = await signIn("Dana Morales");
      // Same browser, signed in, but asking about one customer's job.
      const socket = await socketWith((await ticketFor(dana, osei!.portalToken)).body.ticket);

      const jobEvent = nextEvent<{ status: string }>(socket, "job:changed");
      const boardEvent = nextEvent(socket, "board:changed", 800);
      await request(app).patch(`/api/jobs/${osei!._id.toString()}/status`).set("Cookie", dana).send({ from: "en_route", to: "on_site" });

      expect(await jobEvent).toEqual({ status: "on_site" });
      expect(await boardEvent).toBeNull();
    });

    it("refuses a socket with no ticket, a forged one, or one signed for nonsense", async () => {
      await expect(socketWith("")).rejects.toThrow();
      await expect(socketWith("not.a.jwt")).rejects.toThrow();
      await expect(socketWith(`${signTicket({ kind: "staff", userId: "x", companyId: "y" })}tampered`)).rejects.toThrow();
    });
  });

  describe("the board", () => {
    it("tells every screen in the company when a job changes, and which day to redraw", async () => {
      const dana = await signIn("Dana Morales");
      const socket = await socketWith((await ticketFor(dana)).body.ticket);
      const osei = await Job.findOne({ number: 4471 }).lean();

      const event = nextEvent<{ jobId: string; dates: string[]; reason: string }>(socket, "board:changed");
      await request(app).patch(`/api/jobs/${osei!._id.toString()}/status`).set("Cookie", dana).send({ from: "en_route", to: "on_site" });

      expect(await event).toEqual({
        jobId: osei!._id.toString(),
        dates: [dateIn(osei!.scheduledStart!, TZ)],
        reason: "status",
      });
    });

    it("names both days when a job is dragged to another one", async () => {
      const dana = await signIn("Dana Morales");
      const socket = await socketWith((await ticketFor(dana)).body.ticket);
      const pruitt = await Job.findOne({ number: 4474 }).lean();
      const crew = await Crew.findOne({ name: "Whitfield" }).lean();
      const tomorrow = new Date(pruitt!.scheduledStart!.getTime() + 24 * 60 * 60 * 1000);

      const event = nextEvent<{ dates: string[] }>(socket, "board:changed");
      const moved = await request(app)
        .patch(`/api/jobs/${pruitt!._id.toString()}/schedule`)
        .set("Cookie", dana)
        .send({ crewId: crew!._id.toString(), start: tomorrow.toISOString(), end: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString() });
      expect(moved.status).toBe(204);

      const payload = await event;
      expect(payload!.dates.sort()).toEqual([dateIn(pruitt!.scheduledStart!, TZ), dateIn(tomorrow, TZ)].sort());
    });

    it("says so when the whole demo is rebuilt", async () => {
      const owner = await signIn("Renee Castillo");
      const socket = await socketWith((await ticketFor(owner)).body.ticket);

      const event = nextEvent<{ reason: string }>(socket, "board:changed");
      await request(app).post("/api/demo/reset").set("Cookie", owner);

      expect((await event)?.reason).toBe("demo-reset");
    });

    it("keeps another business's board quiet", async () => {
      const stranger = await socketWith(
        signTicket({ kind: "staff", userId: new Types.ObjectId().toString(), companyId: new Types.ObjectId().toString() }),
      );
      const dana = await signIn("Dana Morales");
      const osei = await Job.findOne({ number: 4471 }).lean();

      const event = nextEvent(stranger, "board:changed", 800);
      await request(app).patch(`/api/jobs/${osei!._id.toString()}/status`).set("Cookie", dana).send({ from: "en_route", to: "on_site" });

      expect(await event).toBeNull();
    });
  });

  describe("the customer's link", () => {
    it("updates the moment the technician marks the job, without a refresh", async () => {
      const osei = await Job.findOne({ number: 4471 }).lean();
      const socket = await socketWith((await ticketFor(undefined, osei!.portalToken)).body.ticket);

      const event = nextEvent<{ status: string }>(socket, "job:changed");
      await request(app)
        .patch(`/api/jobs/${osei!._id.toString()}/status`)
        .set("Cookie", await signIn("Tomas Delgado"))
        .send({ from: "en_route", to: "on_site" });

      expect(await event).toEqual({ status: "on_site" });
    });

    it("hears nothing about anyone else's job, and nothing about the board", async () => {
      const osei = await Job.findOne({ number: 4471 }).lean();
      const socket = await socketWith((await ticketFor(undefined, osei!.portalToken)).body.ticket);
      const someoneElse = await Job.findOne({ number: 4470 }).lean();
      const dana = await signIn("Dana Morales");

      const jobEvent = nextEvent(socket, "job:changed", 800);
      const boardEvent = nextEvent(socket, "board:changed", 800);
      await request(app).patch(`/api/jobs/${someoneElse!._id.toString()}/status`).set("Cookie", dana).send({ from: "on_site", to: "done" });

      expect(await jobEvent).toBeNull();
      expect(await boardEvent).toBeNull();
    });
  });
});
