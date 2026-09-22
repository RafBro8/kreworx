import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/db";

describe("the API shell", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_test"));
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  it("reports healthy once the database is connected", async () => {
    const response = await request(createApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.database).toMatchObject({ connected: true, name: "kreworx_test" });
  });

  it("reports ready, with a status code a monitor can read on its own", async () => {
    const response = await request(createApp()).get("/api/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    // The whole point of the separate endpoint: down has to mean a non-2xx,
    // so an ordinary HTTP check catches it without keyword matching. /health
    // answers 200 either way because Render reads it to decide whether a
    // deploy came up.
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("answers at the root so the deploy URL is not a dead end", async () => {
    const response = await request(createApp()).get("/");

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Kreworx API");
  });

  it("returns a JSON 404 that names the route, not an HTML error page", async () => {
    const response = await request(createApp()).get("/api/nope");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Route not found: GET /api/nope");
  });
});
