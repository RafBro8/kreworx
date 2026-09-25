import type { Role } from "../lib/api";

/**
 * Which sections each seat can open. The server enforces the data behind
 * them; this only decides what the navigation offers.
 */
export const SECTIONS = {
  // A technician's day is its own screen, not the dispatcher's board with the
  // controls taken away: one is a wall chart, the other is read on a phone in
  // somebody's driveway.
  myDay: ["technician"],
  dispatch: ["owner", "dispatcher"],
  map: ["owner", "dispatcher"],
  customers: ["owner", "dispatcher"],
  money: ["owner", "dispatcher"],
  owner: ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Section = keyof typeof SECTIONS;

export function canOpen(role: Role, section: Section): boolean {
  return (SECTIONS[section] as readonly Role[]).includes(role);
}

/** Where each seat lands after signing in. */
export function homeFor(role: Role): string {
  if (role === "owner") return "/owner";
  if (role === "technician") return "/my-day";
  return "/dispatch";
}
