import { Card, ComingUp, Display, StatusPill } from "../../components/ui";

/**
 * What a customer opens from a text message. Stage 1 gives it the frame and
 * the voice; the live arrival time and the approval flow arrive in stage 4.
 */
export default function PortalHome() {
  return (
    <>
      <Card className="rounded-2xl p-[18px]">
        <div className="flex flex-col gap-3.5">
          <StatusPill tone="quiet">Not scheduled yet</StatusPill>
          <div className="flex flex-col gap-1.5">
            <Display className="text-[30px] leading-[1.05]">No visit booked</Display>
            <span className="text-[13.5px] text-ink-muted">
              When a visit is scheduled, this is where the arrival window lives.
            </span>
          </div>
          <div className="flex items-center">
            <span className="h-[9px] w-[9px] rounded-full border-2 border-border bg-panel" />
            <span className="h-0.5 flex-1 bg-line" />
            <span className="h-[9px] w-[9px] rounded-full border-2 border-border bg-panel" />
            <span className="h-0.5 flex-1 bg-line" />
            <span className="h-[9px] w-[9px] rounded-full border-2 border-border bg-panel" />
            <span className="h-0.5 flex-1 bg-line" />
            <span className="h-[9px] w-[9px] rounded-full border-2 border-border bg-panel" />
          </div>
          <div className="flex justify-between font-mono text-[9.5px] text-ink-faint">
            <span>BOOKED</span>
            <span>EN ROUTE</span>
            <span>ON SITE</span>
            <span>DONE</span>
          </div>
        </div>
      </Card>

      <ComingUp title="The customer's whole experience" stage="Stage 4">
        A live arrival time that actually moves, the technician's name and photo, pictures from
        the visit, and one button to approve the work — no login, no app to install.
      </ComingUp>
    </>
  );
}
