import { useEffect, useRef, useState } from "react";

export type DemoClock = { minutes: number; speed: number; endsInSeconds: number };

/**
 * Keeps the demo clock running between server responses.
 *
 * The server says which minute of the demo day it is; this carries that
 * forward using elapsed time, so the "now" line slides along instead of
 * jumping whenever the board happens to reload. It re-anchors to every fresh
 * server reading, so the browser's own clock being wrong never accumulates.
 */
export function useDemoMinutes(clock: DemoClock | null | undefined, everyMs = 5000): number | null {
  const [ticked, setTicked] = useState<number | null>(null);
  const anchor = useRef<{ minutes: number; speed: number; at: number } | null>(null);

  const serverMinutes = clock?.minutes ?? null;
  const speed = clock?.speed ?? null;

  useEffect(() => {
    anchor.current = serverMinutes === null || speed === null ? null : { minutes: serverMinutes, speed, at: Date.now() };
  }, [serverMinutes, speed]);

  useEffect(() => {
    const timer = setInterval(() => {
      const from = anchor.current;
      if (!from) return;
      setTicked(from.minutes + (Math.max(Date.now() - from.at, 0) / 60_000) * from.speed);
    }, everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);

  if (serverMinutes === null) return null;
  // Until the first tick, the server's reading is the best answer there is.
  return ticked !== null && ticked >= serverMinutes ? ticked : serverMinutes;
}
