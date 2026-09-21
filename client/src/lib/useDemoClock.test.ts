import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDemoMinutes } from "./useDemoClock";

/** A fast demo clock so the test runs in milliseconds: 60 demo minutes a second. */
const fast = { minutes: 620, speed: 3600, endsInSeconds: 3600 };

describe("the demo clock between server readings", () => {
  it("starts at whatever the server said", () => {
    const { result } = renderHook(() => useDemoMinutes(fast, 10));
    expect(result.current).toBe(620);
  });

  it("carries on by itself, so the now-line slides instead of jumping", async () => {
    const { result } = renderHook(() => useDemoMinutes(fast, 10));

    await waitFor(() => expect(result.current!).toBeGreaterThan(640));
    // A minute of demo time per real millisecond: about 60 after 60ms, not 600.
    expect(result.current!).toBeLessThan(620 + 3600);
  });

  it("re-anchors when a fresh reading arrives, rather than drifting from the server", async () => {
    const { result, rerender } = renderHook(({ clock }) => useDemoMinutes(clock, 10), {
      initialProps: { clock: fast },
    });
    await waitFor(() => expect(result.current!).toBeGreaterThan(621));

    rerender({ clock: { ...fast, minutes: 900 } });

    expect(result.current).toBe(900);
    await waitFor(() => expect(result.current!).toBeGreaterThan(901));
  });

  it("has nothing to report when the deployment is not a demo", () => {
    const { result } = renderHook(() => useDemoMinutes(null, 10));
    expect(result.current).toBeNull();
  });
});
