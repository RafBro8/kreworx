import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import { api } from "./api";

export type BoardChanged = { jobId: string; dates: string[]; reason: string };
export type JobChanged = { status: string };

type Handlers = {
  onBoardChanged?: (payload: BoardChanged) => void;
  onJobChanged?: (payload: JobChanged) => void;
};

type Options = {
  /** Set to watch one customer's job instead of the company board. */
  portalToken?: string;
  enabled?: boolean;
};

const getTicket = (portalToken?: string) =>
  api<{ ticket: string; url: string | null }>("/realtime/ticket", {
    method: "POST",
    body: JSON.stringify(portalToken ? { portalToken } : {}),
  });

/**
 * Keeps a screen in step with everyone else's.
 *
 * The socket cannot use the session cookie - it connects to the API host
 * directly, where that cookie is third-party - so it fetches a short-lived
 * ticket over the normal API route and presents that instead. The ticket is
 * fetched again on every reconnect, which is what makes waking from sleep or a
 * dropped connection recover on its own.
 *
 * Events say only that something changed; the caller reloads through the API.
 */
export function useLive(handlers: Handlers, { portalToken, enabled = true }: Options = {}): { live: boolean } {
  const [live, setLive] = useState(false);

  // Handlers change on every render; keeping them in a ref means a reconnect
  // is never caused by a new function identity.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;

    let socket: Socket | null = null;
    let cancelled = false;

    void (async () => {
      let host: string | null = null;
      try {
        host = (await getTicket(portalToken)).url;
      } catch {
        return; // Not allowed to listen; the page still works, just not live.
      }
      if (cancelled) return;

      socket = io(host ?? window.location.origin, {
        transports: ["websocket"],
        // Give up rather than retry forever. A socket that cannot connect -
        // misconfigured host, API asleep - would otherwise fetch a ticket every
        // few seconds for as long as the tab is open, which is indistinguishable
        // from a bot hammering the API. Live updates are a bonus; the page works
        // without them.
        reconnectionAttempts: 6,
        reconnectionDelayMax: 30_000,
        auth: (send) => {
          getTicket(portalToken)
            .then((fresh) => send({ ticket: fresh.ticket }))
            .catch(() => send({ ticket: "" }));
        },
      });

      socket.on("connect", () => setLive(true));
      socket.on("disconnect", () => setLive(false));
      socket.on("connect_error", () => setLive(false));
      socket.on("board:changed", (payload: BoardChanged) => latest.current.onBoardChanged?.(payload));
      socket.on("job:changed", (payload: JobChanged) => latest.current.onJobChanged?.(payload));
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
      setLive(false);
    };
  }, [enabled, portalToken]);

  return { live };
}
