import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * Photographs for the demo.
 *
 * These are real photographs of real equipment, from Wikimedia Commons, each
 * under a licence that allows commercial use - see `photos/CREDITS.md` for
 * where each one came from. An earlier version drew them procedurally to keep
 * binaries out of the repository, which was a tidy idea and looked like it:
 * the pictures a customer opens are part of what this system is selling, so
 * the best part of a megabyte is a fair price for them being real.
 *
 * Each is placed on a job it genuinely fits rather than on a caption invented
 * first. Greg Whitaker's file says Carrier central air, and the unit in his
 * photograph is a Carrier; Brightway Dental is a commercial customer with two
 * rooftop units; Amara Osei has a gas furnace in a house.
 */

/** Where the files sit next to this module, in src and in the build alike. */
const FOLDER = join(__dirname, "photos");

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export type DemoPhoto = {
  /** The job it belongs to. */
  jobNumber: number;
  caption: string;
  sharedWithCustomer: boolean;
  contentType: string;
  bytes: Buffer;
};

const PLAN: { file: string; jobNumber: number; caption: string; sharedWithCustomer: boolean }[] = [
  // Greg Whitaker, 118 Oak St: Carrier central air that stopped cooling,
  // fixed and closed first thing this morning.
  {
    file: "outdoor-unit.webp",
    jobNumber: 4466,
    caption: "Condenser running again after the repair",
    sharedWithCustomer: true,
  },
  // Brightway Dental, Tinley Park: two rooftop units, inspected and signed off.
  {
    file: "rooftop-unit.jpg",
    jobNumber: 4467,
    caption: "Rooftop unit after service",
    sharedWithCustomer: true,
  },
  // Amara Osei's job carries the story. Today is the repair visit; these were
  // taken at yesterday's diagnosis. One she can see and one for the office,
  // which is what makes the portal's filtering visible rather than something
  // you have to take on trust.
  {
    file: "furnace-filter.webp",
    jobNumber: 4471,
    caption: "Filter and furnace, from yesterday's visit",
    sharedWithCustomer: true,
  },
  {
    file: "gas-meter.jpg",
    jobNumber: 4471,
    caption: "Gas meter and isolation point - office only",
    sharedWithCustomer: false,
  },
];

export function demoPhotos(): DemoPhoto[] {
  return PLAN.map(({ file, ...photo }) => {
    const contentType = TYPES[extname(file)];
    if (!contentType) throw new Error(`No content type for demo photo ${file}`);
    return { ...photo, contentType, bytes: readFileSync(join(FOLDER, file)) };
  });
}
