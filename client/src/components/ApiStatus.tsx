import { getHealth } from "../lib/api";
import { useApi } from "../lib/useApi";

/**
 * Sits in the ops header. Deliberately real: it reports what the API actually
 * said rather than a decorative green dot.
 */
export default function ApiStatus() {
  const state = useApi(getHealth);

  const { dot, label } =
    state.status === "loading"
      ? { dot: "bg-ink-faint", label: "Connecting…" }
      : state.status === "error"
        ? { dot: "bg-blocked", label: "API unreachable" }
        : state.data.database.connected
          ? { dot: "bg-done", label: "API connected" }
          : { dot: "bg-waiting", label: "API up, database down" };

  return (
    <div className="flex items-center gap-2" title={state.status === "error" ? state.message : undefined}>
      <span className={`h-[7px] w-[7px] rounded-full ${dot}`} />
      <span className="text-[13px] text-ink-muted">{label}</span>
    </div>
  );
}
