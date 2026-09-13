import { ComingUp, Eyebrow } from "../../components/ui";

const hours = ["7 AM", "8", "9", "10", "11", "12 PM", "1", "2", "3"];
const crews = [
  { initials: "RM", name: "Ramirez", van: "VAN 12" },
  { initials: "TD", name: "Delgado", van: "VAN 08" },
  { initials: "BW", name: "Whitfield", van: "VAN 04" },
  { initials: "AO", name: "Okafor", van: "VAN 15" },
];

/**
 * The board's frame — the time axis and the crew rows — is part of the shell,
 * so the shape of the screen is settled before any data exists. Jobs land in
 * these lanes in stage 3.
 */
export default function Dispatch() {
  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[176px_repeat(9,minmax(0,1fr))] border-b border-line pb-3">
            <Eyebrow>Crew</Eyebrow>
            {hours.map((hour) => (
              <span key={hour} className="font-mono text-[11.5px] text-ink-faint">
                {hour}
              </span>
            ))}
          </div>

          {crews.map((crew) => (
            <div
              key={crew.initials}
              className="grid h-[92px] grid-cols-[176px_repeat(9,minmax(0,1fr))] items-center gap-2 border-b border-line/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-raised text-xs font-medium text-ink-muted">
                  {crew.initials}
                </span>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-sm font-medium">{crew.name}</span>
                  <span className="font-mono text-[10.5px] text-ink-faint">{crew.van}</span>
                </div>
              </div>
              <div className="col-span-9 flex h-16 items-center justify-center rounded-tile border border-dashed border-border">
                <span className="text-xs text-ink-faint">No jobs scheduled</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ComingUp title="The dispatch board" stage="Stage 3">
        Jobs become blocks in these lanes — drag one to another crew or another hour and the
        change reaches every open screen over the socket connection, including the customer's.
        Day, week and map are three views of the same schedule.
      </ComingUp>
    </div>
  );
}
