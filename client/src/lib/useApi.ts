import { useCallback, useEffect, useRef, useState } from "react";

import { ApiRequestError } from "./api";

export type ApiState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T; refreshing: boolean }
  | { status: "error"; message: string; httpStatus: number | null };

type Settled<T> = { status: "ready"; data: T } | { status: "error"; message: string; httpStatus: number | null };

/**
 * Loads something from the API when a component mounts, and again whenever
 * `key` changes or `reload` is called.
 *
 * Each result is stamped with the request that produced it, and a result
 * stamped for an older request never overwrites a newer one. While a new
 * request is in flight the last good data stays on screen, marked
 * `refreshing`, so a board does not blank out every time a job moves.
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

  let state: ApiState<T>;
  if (!result) state = { status: "loading" };
  else if (result.request === request) state = result.state.status === "ready" ? { ...result.state, refreshing: false } : result.state;
  else if (result.state.status === "ready") state = { ...result.state, refreshing: true };
  else state = { status: "loading" };

  return { ...state, reload };
}
