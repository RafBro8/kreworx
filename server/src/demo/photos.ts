import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Photographs for the demo.
 *
 * These are real photographs of real equipment, from Wikimedia Commons, each
 * under a licence that allows commercial use - see `photos/CREDITS.md` for
 * where each one came from. An earlier version drew them procedurally to keep
 * binaries out of the repository, which was a tidy idea and looked like it:
 * the pictures a customer opens are part of what this system is selling, so
 * three-quarters of a megabyte is a fair price for them being real.
 *
 * Each one is placed on a job it genuinely fits rather than on a caption
 * invented first: Brightway Dental is a commercial customer with two Trane
 * rooftop units, and Amara Osei has a Goodman furnace in a house.
 */

/** Where the files sit next to this module, in src and in the build alike. */
const FOLDER = join(__dirname, "photos");

export type DemoPhoto = {
  /** The job it belongs to. */
  jobNumber: number;
  caption: string;
  sharedWithCustomer: boolean;
  contentType: string;
  bytes: Buffer;
};

const PLAN: { file: string; jobNumber: number; caption: string; sharedWithCustomer: boolean }[] = [
  // Brightway Dental, Tinley Park: two Trane Voyager rooftop units, inspected
  // and signed off first thing this morning.
  {
    file: "rooftop-unit.jpg",
    jobNumber: 4467,
    caption: "Rooftop unit after service",
    sharedWithCustomer: true,
  },
  // Amara Osei's job carries the story. One photograph she can see, and one
  // for the office - which is what makes the portal's filtering visible
  // rather than something you have to take on trust.
  {
    file: "data-plate.jpg",
    jobNumber: 4471,
    caption: "Model and serial from the unit",
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
  return PLAN.map(({ file, ...photo }) => ({
    ...photo,
    contentType: "image/jpeg",
    bytes: readFileSync(join(FOLDER, file)),
  }));
}
