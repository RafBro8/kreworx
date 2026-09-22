import { GeoJSONSource, Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { useMe } from "../../auth/context";
import JobPanel from "../../components/JobPanel";
import { Eyebrow } from "../../components/ui";
import { getCrews, getJobs, type JobSummary } from "../../lib/api";
import { clockFromMinutes, dateInZone, STATUS, timeRange, type Tone } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useDemoMinutes } from "../../lib/useDemoClock";
import { useLive } from "../../lib/useLive";
import { boundsOf, vanPositions, type Van } from "../../lib/vans";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * OpenFreeMap serves OpenStreetMap vector tiles with no account and no key.
 * Its dark style is used as it comes. The first version took the light style
 * and inverted the canvas in CSS to darken it, which is a filter over WebGL
 * for no good reason now that a dark style exists.
 */
const STYLE = "https://tiles.openfreemap.org/styles/dark";

/**
 * MapLibre parses tiles in a web worker, and works out where that worker lives
 * from `import.meta.url` - which, once bundled, is this chunk. It therefore
 * asked for /assets/maplibre-gl-worker.mjs, a file no bundler emits, and the
 * single-page fallback answered with index.html. The worker never started, so
 * not one tile was ever requested and the map came up empty under its pins.
 * Vite builds the worker for us instead, and we hand over the real URL.
 */
setWorkerUrl(workerUrl);

/** The service area: the south-west suburbs, before any job has loaded. */
const HOME = { center: [-87.87, 41.54] as [number, number], zoom: 10.4 };

const pinColour: Record<Tone, string> = {
  done: "bg-done",
  active: "bg-accent",
  waiting: "bg-waiting",
  blocked: "bg-blocked",
  quiet: "bg-ink-faint",
};

/** A stable empty list, so effects do not re-run while the day is loading. */
const NO_JOBS: JobSummary[] = [];

const LEGEND: { tone: Tone; label: string }[] = [
  { tone: "active", label: "On the road or on site" },
  { tone: "done", label: "Complete" },
  { tone: "blocked", label: "Blocked" },
  { tone: "quiet", label: "Scheduled" },
];

/**
 * Where every van is, right now.
 *
 * The map is a real street map of the towns Northline works in; the pins and
 * vans are ours. Clicking either opens the same job panel the board uses, so
 * there is one place where a job is read and changed.
 */
export default function MapView() {
  const me = useMe();
  const crews = useApi(getCrews);
  const day = useApi(() => getJobs());
  // A second between steps: fast enough that the vans glide rather than hop.
  const demoMinutes = useDemoMinutes(day.status === "ready" ? day.data.demo : null, 1000);
  const [selected, setSelected] = useState<string | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const jobPins = useRef(new Map<string, Marker>());
  const vanPins = useRef(new Map<string, Marker>());
  const framed = useRef(false);
  // Two stages: the map object exists, and then its style has finished. Pins
  // only need the first, so they appear even where tiles are slow or blocked.
  const [mapCreated, setMapCreated] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const { reload } = day;
  const refresh = useCallback(() => reload(), [reload]);
  const shownDate = day.status === "ready" ? day.data.date : null;
  const { live } = useLive({
    onBoardChanged: (event) => {
      if (event.reason === "demo-reset" || event.dates.length === 0 || (shownDate && event.dates.includes(shownDate))) {
        refresh();
      }
    },
  });

  // ---- the map itself, created once ---------------------------------------
  useEffect(() => {
    if (!container.current) return;

    const instance = new MapLibreMap({
      container: container.current,
      style: STYLE,
      center: HOME.center,
      zoom: HOME.zoom,
      attributionControl: { compact: true },
    });
    instance.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    instance.on("load", () => {
      instance.addSource("runs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instance.addLayer({
        id: "runs",
        type: "line",
        source: "runs",
        paint: { "line-color": "#7fc8de", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0.8 },
      });
      setStyleReady(true);
    });
    // Tiles come from a free community service with no uptime promise, so a
    // failure has to leave the page usable rather than blank.
    instance.on("error", () => setMapFailed(true));

    map.current = instance;
    setMapCreated(true);
    const pins = jobPins.current;
    const vans = vanPins.current;
    return () => {
      instance.remove();
      map.current = null;
      pins.clear();
      vans.clear();
      framed.current = false;
      setMapCreated(false);
      setStyleReady(false);
    };
  }, []);

  const today = day.status === "ready" ? day.data : null;
  const jobs = today?.jobs ?? NO_JOBS;
  const timezone = today?.timezone ?? "UTC";
  const crewList = crews.status === "ready" ? crews.data : null;
  // Recomputed when the clock ticks, which is what moves the vans.
  const vans = useMemo(
    () => (crewList ? vanPositions(crewList, jobs, demoMinutes, timezone) : []),
    [crewList, jobs, demoMinutes, timezone],
  );

  // ---- job pins ------------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapCreated) return;

    for (const marker of jobPins.current.values()) marker.remove();
    jobPins.current.clear();

    for (const job of jobs) {
      if (!job.location) continue;
      const element = document.createElement("button");
      element.type = "button";
      element.className = "cursor-pointer";
      element.title = `#${job.number} ${job.title} - ${job.customer?.name ?? ""}`;
      element.setAttribute("aria-label", `${job.title}, ${job.customer?.name ?? ""}`);
      element.innerHTML = `<span class="block h-3.5 w-3.5 rounded-full border-2 border-canvas ${pinColour[STATUS[job.status].tone]} ${
        selected === job.id ? "ring-2 ring-accent ring-offset-1 ring-offset-canvas" : ""
      }"></span>`;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelected(job.id);
      });

      jobPins.current.set(
        job.id,
        new Marker({ element }).setLngLat([job.location.lng, job.location.lat]).addTo(instance),
      );
    }

    if (!framed.current) {
      const bounds = boundsOf(jobs.flatMap((job) => (job.location ? [job.location] : [])));
      if (bounds) {
        instance.fitBounds(bounds, { padding: 90, maxZoom: 12, duration: 0 });
        framed.current = true;
      }
    }
  }, [jobs, mapCreated, selected]);

  // ---- vans, and the line to where they are going --------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapCreated) return;

    for (const van of vans) {
      const existing = vanPins.current.get(van.crewId);
      if (existing) {
        existing.setLngLat([van.at.lng, van.at.lat]);
        const label = existing.getElement().firstElementChild;
        if (label) label.className = vanClasses(van);
        continue;
      }

      const element = document.createElement("div");
      element.innerHTML = `<span class="${vanClasses(van)}">${van.initials}</span>`;
      element.title = `${van.crewName} · ${van.van}`;
      element.setAttribute("aria-label", `${van.crewName}, ${van.van}, ${van.state}`);
      if (van.towards) {
        element.addEventListener("click", () => setSelected(van.towards!.jobId));
        element.className = "cursor-pointer";
      }
      vanPins.current.set(
        van.crewId,
        new Marker({ element }).setLngLat([van.at.lng, van.at.lat]).addTo(instance),
      );
    }

    for (const [crewId, marker] of vanPins.current) {
      if (!vans.some((van) => van.crewId === crewId)) {
        marker.remove();
        vanPins.current.delete(crewId);
      }
    }

    // The line is a style layer, so it has to wait for the style.
    const source = styleReady ? (instance.getSource("runs") as GeoJSONSource | undefined) : undefined;
    source?.setData({
      type: "FeatureCollection",
      features: vans
        .filter((van) => van.towards)
        .map((van) => ({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [van.at.lng, van.at.lat],
              [van.towards!.lng, van.towards!.lat],
            ],
          },
        })),
    });
  }, [vans, mapCreated, styleReady]);

  const onTheRoad = jobs.filter((job) => job.status === "en_route").length;
  const done = jobs.filter((job) => job.status === "done").length;
  const isToday = day.status === "ready" && day.data.date === dateInZone(new Date(), timezone);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5 rounded-control border border-border bg-surface p-1">
          <Link to="/dispatch" className="rounded-[7px] px-3.5 py-1.5 text-[13px] text-ink-muted hover:text-ink">
            Board
          </Link>
          <span aria-current="page" className="rounded-[7px] bg-raised px-3.5 py-1.5 text-[13px] font-medium">
            Map
          </span>
        </div>
        {isToday && demoMinutes !== null ? (
          <span
            className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 font-mono text-[11px] text-accent"
            title="The demo day runs fast so you can watch it move. It restarts every hour."
          >
            Demo clock {clockFromMinutes(demoMinutes)}
          </span>
        ) : null}
        {live ? (
          <span className="ml-auto flex items-center gap-2 text-[12px] text-ink-faint">
            <span className="h-[6px] w-[6px] rounded-full bg-done" />
            Live
          </span>
        ) : null}
      </div>

      <div className="relative min-h-[460px] flex-1 overflow-hidden rounded-card border border-border bg-panel">
        {/* Sized, not absolutely positioned: MapLibre sets position:relative on
            its own container, which would undo inset-0 and collapse it. */}
        <div ref={container} className="h-full w-full" data-testid="map-canvas" />

        {mapFailed ? (
          <p role="status" className="absolute top-4 left-4 z-10 rounded-control border border-waiting-line bg-waiting-bg px-3 py-2 text-[12px] text-ink">
            The map tiles could not be reached. Everything else still works.
          </p>
        ) : null}

        <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-col gap-2 rounded-card border border-border bg-panel/90 px-3.5 py-3">
          <Eyebrow>Today</Eyebrow>
          {LEGEND.map((entry) => (
            <span key={entry.label} className="flex items-center gap-2 text-[12px] text-ink-muted">
              <span className={`h-2 w-2 rounded-full ${pinColour[entry.tone]}`} />
              {entry.label}
            </span>
          ))}
        </div>

        <div className="absolute inset-x-4 bottom-4 z-10 flex flex-wrap items-center gap-6 rounded-card border border-border bg-panel/90 px-5 py-3.5">
          <Stat label="On the road" value={String(onTheRoad)} />
          <span className="h-9 w-px bg-line" />
          <Stat label="Done today" value={`${done} / ${jobs.length}`} />
          <span className="h-9 w-px bg-line" />
          <Stat label="Crews out" value={String(vans.filter((van) => van.state !== "waiting").length)} />
          {crews.status === "ready" ? (
            <ul className="ml-auto hidden items-center gap-4 lg:flex">
              {vans.map((van) => (
                <li key={van.crewId} className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <span className={van.state === "driving" ? "text-accent" : "text-ink-faint"}>●</span>
                  {van.crewName}
                  <span className="font-mono text-[11px] text-ink-faint">{describe(van, jobs, timezone)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {crews.status === "error" ? <p className="text-sm text-blocked" role="alert">{crews.message}</p> : null}
      {day.status === "error" ? <p className="text-sm text-blocked" role="alert">{day.message}</p> : null}

      {selected && crews.status === "ready" && day.status === "ready" ? (
        <JobPanel
          jobId={selected}
          crews={crews.data}
          timezone={timezone}
          boardDate={day.data.date}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      ) : null}

      <span className="sr-only">{me.company.name} service area</span>
    </div>
  );
}

function vanClasses(van: Van): string {
  const base =
    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-medium shadow-[0_2px_10px_rgba(0,0,0,0.5)]";
  return van.state === "driving"
    ? `${base} border-accent bg-accent text-accent-ink`
    : van.state === "working"
      ? `${base} border-accent-line bg-accent-soft text-accent`
      : `${base} border-border bg-raised text-ink-muted`;
}

/** "10:30-12:30 · No heat" for a crew on the move, or what they are standing on. */
function describe(van: Van, jobs: JobSummary[], timezone: string): string {
  if (van.state === "driving" && van.towards) return `→ ${van.towards.jobTitle}`;
  const here = jobs.find(
    (job) => job.crewId === van.crewId && ["on_site", "awaiting_approval", "parts_on_order"].includes(job.status),
  );
  if (here?.scheduledStart && here.scheduledEnd) return timeRange(here.scheduledStart, here.scheduledEnd, timezone);
  return "idle";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-display text-[26px] leading-none font-bold tracking-[-0.02em]">{value}</span>
    </div>
  );
}
