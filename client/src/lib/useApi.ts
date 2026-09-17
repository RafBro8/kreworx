import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "./api";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; httpStatus: number | null };

type Settled<T> = Exclude<ApiState<T>, { status: "loading" }>;

/**
 * Loads something from the API when a component mounts, and again whenever
 * `key` changes or `reload` is called.
 *
 * Each result is stamped with the request that produced it, and anything
 * stamped for an older request reads as still loading. That drops late
 * responses without resetting state inside the effect.
 */
export function useApi<T>(load: () => Promise<T>, key: string = ""): ApiState<T> & { reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ request: string; state: Settled<T> } | null>(null);
  const request = JSON.stringify([key, attempt]);

  // Always call the latest `load` without making every render a new request.
  const latestLoad = useRef(load);
  useEffect(() => {
    latestLoad.current = load;
  });

  useEffect(() => {
    let current = true;
    latestLoad
      .current()
      .then((data) => {
        if (current) setResult({ request, state: { status: "ready", data } });
      })
      .catch((error: unknown) => {
        if (!current) return;
        setResult({
          request,
          state: {
            status: "error",
            message: error instanceof Error ? error.message : "Something went wrong",
            httpStatus: error instanceof ApiRequestError ? error.status : null,
          },
        });
      });
    return () => {
      current = false;
    };
  }, [request]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const state: ApiState<T> = result && result.request === request ? result.state : { status: "loading" };
  return { ...state, reload };
}
