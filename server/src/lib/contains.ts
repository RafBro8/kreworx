/**
 * Case-insensitive "contains", with anything regex-special treated literally.
 *
 * Shared rather than written out per route: a search term comes from whatever
 * someone typed, and a stray bracket must be a bracket rather than the start of
 * a character class that could be made to run slowly on purpose.
 */
export function contains(term: string): RegExp {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}
