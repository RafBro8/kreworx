import type { Role } from "../lib/api";

/**
 * Which sections each seat can open. The server enforces the data behind
 * them; this only decides what the navigation offers.
 */
export const SECTIONS = {
  dispatch: ["owner", "dispatcher", "technician"],
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
  return role === "owner" ? "/owner" : "/dispatch";
}
