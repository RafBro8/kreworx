import { describe, expect, it } from "vitest";

import type { Crew, JobStatus, JobSummary } from "./api";
import { TRAVEL_MINUTES, boundsOf, vanPositions } from "./vans";

const TZ = "America/Chicago";

const crews: Crew[] = [
  { id: "c-delgado", name: "Delgado", van: "VAN 08", lead: { id: "u-tomas", name: "Tomas Delgado", title: "Lead" }, members: [] },
  { id: "c-novak", name: "Novak", van: "VAN 03", lead: { id: "u-petra", name: "Petra Novak", title: "Lead" }, members: [] },
];

const brightway = { lat: 41.5731, lng: -87.7845 };
const osei = { lat: 41.5261, lng: -87.8892 };

/** Jobs on the 19th: 7 AM in Mokena is 12:00 UTC in September. */
function job(overrides: Partial<JobSummary> & { id: string }): JobSummary {
  return {
    number: 0,
    title: "A job",
    status: "scheduled",
    priority: "normal",
    crewId: "c-delgado",
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: 120,
    schedulingNote: null,
    requestedAt: "2026-09-19T12:00:00Z",
    customer: { name: "Someone", kind: "residential" },
    address: { street: "1 Street", city: "Mokena" },
    location: osei,
    ...overrides,
  };
}

const atMokena = (clock: string) => `2026-09-19T${clock}:00Z`;
const minutes = (hours: number, mins = 0) => hours * 60 + mins;

describe("where the vans are", () => {
  it("parks the van at the job it is working on", () => {
    const jobs = [
      job({ id: "j1", status: "on_site", location: osei, scheduledStart: atMokena("15:30"), scheduledEnd: atMokena("17:30") }),
    ];

    const [van] = vanPositions(crews, jobs, minutes(11), TZ);

    expect(van).toMatchObject({ crewName: "Delgado", van: "VAN 08", initials: "TD", state: "working", at: osei, towards: null });
  });

  it("slides it along the road as the crew drives to their next call", () => {
    // Brightway finished; Amara's window opens at 10:30, so they set off at 10:10.
    const jobs = [
      job({ id: "j1", status: "done", location: brightway, scheduledStart: atMokena("12:00"), scheduledEnd: atMokena("15:00") }),
      job({ id: "j2", status: "en_route", location: osei, scheduledStart: atMokena("15:30"), scheduledEnd: atMokena("17:30"), title: "No heat" }),
    ];

    const setOff = vanPositions(crews, jobs, minutes(10, 10), TZ)[0]!;
    const halfWay = vanPositions(crews, jobs, minutes(10, 20), TZ)[0]!;
    const arriving = vanPositions(crews, jobs, minutes(10, 30), TZ)[0]!;

    expect(setOff.at).toEqual(brightway);
    expect(halfWay.at.lat).toBeCloseTo((brightway.lat + osei.lat) / 2, 5);
    expect(halfWay.at.lng).toBeCloseTo((brightway.lng + osei.lng) / 2, 5);
    expect(arriving.at).toEqual(osei);

    expect(halfWay.state).toBe("driving");
    expect(halfWay.towards).toMatchObject({ jobId: "j2", jobTitle: "No heat" });
  });

  it("does not run ahead of the job or trail behind the previous one", () => {
    const jobs = [
      job({ id: "j1", status: "done", location: brightway, scheduledStart: atMokena("12:00"), scheduledEnd: atMokena("15:00") }),
      job({ id: "j2", status: "en_route", location: osei, scheduledStart: atMokena("15:30"), scheduledEnd: atMokena("17:30") }),
    ];

    expect(vanPositions(crews, jobs, minutes(7), TZ)[0]!.at).toEqual(brightway);
    expect(vanPositions(crews, jobs, minutes(14), TZ)[0]!.at).toEqual(osei);
  });

  it("waits at the last job it finished when there is nothing on the road", () => {
    const jobs = [
      job({ id: "j1", status: "done", location: brightway, scheduledStart: atMokena("12:00"), scheduledEnd: atMokena("15:00") }),
      job({ id: "j2", status: "done", location: osei, scheduledStart: atMokena("15:30"), scheduledEnd: atMokena("17:30") }),
    ];

    const [van] = vanPositions(crews, jobs, minutes(16), TZ);

    expect(van).toMatchObject({ state: "waiting", at: osei });
  });

  it("waits at the first stop before the day has started", () => {
    const jobs = [job({ id: "j1", status: "scheduled", location: brightway, scheduledStart: atMokena("12:00"), scheduledEnd: atMokena("15:00") })];

    expect(vanPositions(crews, jobs, minutes(6), TZ)[0]).toMatchObject({ state: "waiting", at: brightway });
  });

  it("shows no van for a crew with nothing booked today", () => {
    const jobs = [job({ id: "j1", crewId: "c-delgado", status: "done", scheduledStart: atMokena("12:00"), scheduledEnd: atMokena("15:00") })];

    expect(vanPositions(crews, jobs, minutes(12), TZ).map((van) => van.crewId)).toEqual(["c-delgado"]);
  });

  it("ignores jobs with no place or no time, rather than putting a van in the sea", () => {
    const jobs = [
      job({ id: "j1", status: "on_site", location: null, scheduledStart: atMokena("15:30"), scheduledEnd: atMokena("17:30") }),
      job({ id: "j2", status: "scheduled", scheduledStart: null, scheduledEnd: null }),
    ];

    expect(vanPositions(crews, jobs, minutes(11), TZ)).toEqual([]);
  });

  it("treats a blocked or waiting job as being worked on, not driven to", () => {
    for (const status of ["awaiting_approval", "parts_on_order"] as JobStatus[]) {
      const jobs = [job({ id: "j1", status, location: osei, scheduledStart: atMokena("15:30"), scheduledEnd: atMokena("17:30") })];
      expect(vanPositions(crews, jobs, minutes(12), TZ)[0]).toMatchObject({ state: "working", at: osei });
    }
  });

  it("puts the van at its destination when there is no demo clock to interpolate with", () => {
    const jobs = [
      job({ id: "j1", status: "done", location: brightway, scheduledStart: atMokena("12:00"), scheduledEnd: atMokena("15:00") }),
      job({ id: "j2", status: "en_route", location: osei, scheduledStart: atMokena("15:30"), scheduledEnd: atMokena("17:30") }),
    ];

    expect(vanPositions(crews, jobs, null, TZ)[0]!.at).toEqual(osei);
  });

  it("matches the server's travel window, so a van arrives as the job starts", () => {
    expect(TRAVEL_MINUTES).toBe(20);
  });
});

describe("framing the map", () => {
  it("boxes every point", () => {
    expect(boundsOf([brightway, osei])).toEqual([
      [-87.8892, 41.5261],
      [-87.7845, 41.5731],
    ]);
  });

  it("has nothing to frame when there is nothing to show", () => {
    expect(boundsOf([])).toBeNull();
  });
});
