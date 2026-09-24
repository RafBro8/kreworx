/**
 * Dragging a job around the board, with a pointer rather than a mouse.
 *
 * The board used HTML5 drag-and-drop, which does nothing at all on a touch
 * screen - a dispatcher on a tablet could open a job and move it with the
 * panel's selects, but could not drag it. Pointer events cover mouse, pen and
 * finger with one set of handlers, which is why they replaced it.
 *
 * The catch is that a touch pointer is implicitly captured by whatever it
 * started on, so a lane never hears about a finger passing over it. The job
 * block therefore tracks the gesture itself and works out which lane is under
 * the pointer, which is what `laneUnder` is for.
 */

export type Drag = { jobId: string; minutes: number; grabbedAt: number };

export type Rect = { left: number; top: number; width: number; height: number };

/** Far enough to mean "drag" rather than "tap", in CSS pixels. */
export const DRAG_THRESHOLD = 6;

export function movedFar(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.abs(to.x - from.x) >= DRAG_THRESHOLD || Math.abs(to.y - from.y) >= DRAG_THRESHOLD;
}

/**
 * How far into the job the pointer grabbed it, in minutes, so the block keeps
 * its shape under the finger instead of snapping its start to the touch point.
 */
export function grabbedAtMinutes(clientX: number, block: Rect, spanMinutes: number): number {
  if (block.width <= 0) return 0;
  return ((clientX - block.left) / block.width) * spanMinutes;
}

/** Where a job would land in a lane: the pointer, less the grab, snapped. */
export function dropStartIn(
  clientX: number,
  lane: Rect,
  drag: Drag,
  board: { start: number; end: number; snap: number },
): number {
  if (lane.width <= 0) return board.start;
  const span = board.end - board.start;
  const atPointer = board.start + ((clientX - lane.left) / lane.width) * span;
  const start = Math.round((atPointer - drag.grabbedAt) / board.snap) * board.snap;
  return Math.min(Math.max(start, board.start), board.end - drag.minutes);
}

/** Which lane the pointer is over, or null when it is over none of them. */
export function laneUnder(
  point: { x: number; y: number },
  lanes: Iterable<[string, { getBoundingClientRect(): Rect }]>,
): { crewId: string; rect: Rect } | null {
  for (const [crewId, element] of lanes) {
    const rect = element.getBoundingClientRect();
    const inside =
      point.x >= rect.left &&
      point.x <= rect.left + rect.width &&
      point.y >= rect.top &&
      point.y <= rect.top + rect.height;
    if (inside) return { crewId, rect };
  }
  return null;
}
