import { Card, Display } from "../../components/ui";

/** Someone reached /portal without a job link — usually a trimmed URL. */
export default function PortalHome() {
  return (
    <Card className="mt-6 rounded-2xl p-6">
      <div className="flex flex-col gap-2">
        <Display className="text-2xl">Open the link from your text</Display>
        <p className="text-sm leading-relaxed text-ink-muted">
          Each visit has its own private link, sent by text or email when it is booked. It shows when your technician
          is arriving and anything that needs your approval.
        </p>
      </div>
    </Card>
  );
}
