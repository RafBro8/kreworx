import type { Crew, JobSummary } from "./api";
import { minutesOfDay } from "./format";

/**
 * Where each van is right now.
 *
 * Nobody is fitting GPS trackers to a demo, so position is derived from the
 * schedule: a crew sits at the job they are working, slides along the line to
 * their next one while they are en route, and waits at their last stop
 * otherwise. The travel window matches the server's, so a van arrives exactly
 * as the job it is heading for flips to on site.
 */

/** How long before a window opens a crew sets off. Matches the server simulator. */
export const TRAVEL_MINUTES = 20;

export type Point = { lat: number; lng: number };

export type Van = {
  crewId: string;
  crewName: string;
  van: string;
  initials: string;
  at: Point;
  state: "driving" | "working" | "waiting";
  /** Where it is heading, when it is on the road. */
  towards: (Point & { jobId: string; jobTitle: string }) | null;
};

const WORKING = ["on_site", "awaiting_approval", "parts_on_order"];

function lerp(from: Point, to: Point, through: number): Point {
  return {
    lat: from.lat + (to.lat - from.lat) * through,
    lng: from.lng + (to.lng - from.lng) * through,
  };
}

type Placed = JobSummary & { location: Point; scheduledStart: string };

/** Today's jobs for one crew that have both a place and a time, earliest first. */
function runFor(crew: Crew, jobs: JobSummary[]): Placed[] {
  return jobs
    .filter((job): job is Placed => job.crewId === crew.id && job.location !== null && job.scheduledStart !== null)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

export function vanPositions(
  crews: Crew[],
  jobs: JobSummary[],
  demoMinutes: number | null,
  timeZone: string,
): Van[] {
  const vans: Van[] = [];

  for (const crew of crews) {
    const run = runFor(crew, jobs);
    if (run.length === 0) continue;

    const identity = {
      crewId: crew.id,
      crewName: crew.name,
      van: crew.van,
      initials: crew.lead ? initialsOf(crew.lead.name) : crew.name.slice(0, 2).toUpperCase(),
    };

    const working = run.find((job) => WORKING.includes(job.status));
    if (working) {
      vans.push({ ...identity, at: working.location, state: "working", towards: null });
      continue;
    }

    const driving = run.find((job) => job.status === "en_route");
    if (driving) {
      const index = run.indexOf(driving);
      const from = run[index - 1]?.location ?? driving.location;
      const opens = minutesOfDay(driving.scheduledStart, timeZone);
      // No demo clock - a real deployment with no tracker - so show the van as
      // good as arrived rather than inventing a position.
      const through =
        demoMinutes === null ? 1 : Math.min(Math.max((demoMinutes - (opens - TRAVEL_MINUTES)) / TRAVEL_MINUTES, 0), 1);

      vans.push({
        ...identity,
        at: lerp(from, driving.location, through),
        state: "driving",
        towards: { ...driving.location, jobId: driving.id, jobTitle: driving.title },
      });
      continue;
    }

    // Between jobs: parked wherever they finished, or at their first stop if
    // the day has not started.
    const lastDone = [...run].reverse().find((job) => job.status === "done");
    vans.push({ ...identity, at: (lastDone ?? run[0]!).location, state: "waiting", towards: null });
  }

  return vans;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

/** The corners of a box holding every point, for framing the map. */
export function boundsOf(points: Point[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
