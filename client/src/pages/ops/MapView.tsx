import { ComingUp } from "../../components/ui";

export default function MapView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="relative flex h-[420px] items-center justify-center overflow-hidden rounded-card border border-border bg-panel">
        {/* A plain grid stands in for the map so the page has its real
            proportions before the tiles arrive. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(var(--surface-border) 1px, transparent 1px), linear-gradient(90deg, var(--surface-border) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <span className="relative font-mono text-[11px] tracking-[0.12em] text-ink-faint uppercase">
          Map loads here
        </span>
      </div>

      <ComingUp title="Where every van is, right now" stage="Stage 3">
        Vans on the map, the route to the next job, and the day's numbers along the bottom —
        the screen a dispatcher leaves open all day, and the one that sells the product.
      </ComingUp>
    </div>
  );
}
