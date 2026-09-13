import { useEffect, useState } from "react";

import { getHealth, type Health } from "./api";

type HealthState =
  | { status: "loading" }
  | { status: "ready"; health: Health }
  | { status: "error"; message: string };

/**
 * The shell calls the API on load for one reason: on a deployed demo it is the
 * difference between "the front end is up" and "the whole stack is up", and
 * Render's free tier is not in play here but a sleeping or misconfigured API
 * should be visible immediately rather than discovered mid-demo.
 */
export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((health) => {
        if (!cancelled) setState({ status: "ready", health });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "API unreachable",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
