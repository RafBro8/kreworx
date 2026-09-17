/**
 * Always same-origin. Locally Vite proxies /api to the server; on Vercel a
 * rewrite forwards it to Render. The browser never talks to another site,
 * which keeps the session cookie first-party in every browser, Safari included.
 */
const BASE = "/api";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, message);
  }

  return body as T;
}

// ---- shapes the API returns ------------------------------------------------

export type Role = "owner" | "dispatcher" | "technician";

export type Health = {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  commit: string | null;
  demoMode: boolean;
  database: { connected: boolean; name?: string | null };
};

export type Me = {
  user: { id: string; name: string; role: Role; title: string | null };
  company: { id: string; name: string; timezone: string; isDemo: boolean };
};

export type DemoAccounts = {
  company: { name: string };
  staff: { id: string; name: string; role: Role; title: string | null }[];
  customer: { name: string; jobTitle: string; portalToken: string } | null;
};

export type JobStatus =
  | "unscheduled"
  | "scheduled"
  | "en_route"
  | "on_site"
  | "awaiting_approval"
  | "parts_on_order"
  | "done"
  | "cancelled";

export type Crew = {
  id: string;
  name: string;
  van: string;
  lead: { id: string; name: string; title: string | null } | null;
  members: { id: string; name: string; title: string | null }[];
};

export type JobSummary = {
  id: string;
  number: number;
  title: string;
  status: JobStatus;
  priority: "normal" | "high" | "urgent";
  crewId: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedMinutes: number;
  schedulingNote: string | null;
  requestedAt: string;
  customer: { name: string; kind: "residential" | "commercial" } | null;
  address: { street: string; city: string } | null;
};

export type DayOfJobs = { date: string; timezone: string; jobs: JobSummary[] };

export type OwnerSummary = {
  date: string;
  jobsToday: number;
  doneToday: number;
  quotesAwaiting: { count: number; totalCents: number };
  invoicedTodayCents: number;
  invoicedThisWeekCents: number;
};

export type PortalView = {
  company: { name: string; phone: string | null; timezone: string };
  customer: { firstName: string };
  job: {
    number: number;
    title: string;
    status: JobStatus;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    timeline: { status: JobStatus; at: string }[];
  };
  address: { street: string; city: string };
  technician: { name: string; title: string | null; years: number | null } | null;
  quote: {
    number: number;
    status: "sent" | "approved" | "declined";
    findings: string | null;
    sentAt: string | null;
    validUntil: string | null;
    lineItems: {
      description: string;
      detail: string | null;
      quantity: number;
      unitPriceCents: number;
      waived: boolean;
      amountCents: number;
    }[];
    totalCents: number;
  } | null;
};

export type JobDetail = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: JobStatus;
  priority: "normal" | "high" | "urgent";
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedMinutes: number;
  schedulingNote: string | null;
  requestedAt: string;
  crew: { id: string; name: string; van: string } | null;
  customer: { name: string; kind: "residential" | "commercial"; phone: string | null; email: string | null } | null;
  property: {
    street: string;
    city: string;
    state: string;
    zip: string;
    accessNotes: string | null;
    equipment: { kind: string; make: string; model: string; installedYear: number }[];
  } | null;
  timeline: { status: JobStatus; at: string }[];
  quote: { number: number; status: string; totalCents: number } | null;
  invoice: { number: number; status: string; totalCents: number } | null;
  portalToken: string | null;
  actions: { statuses: JobStatus[]; reschedule: boolean; unschedule: boolean };
};

// ---- calls -------------------------------------------------------------------

export const getHealth = () => api<Health>("/health");
export const getMe = () => api<Me>("/auth/me");
export const getDemoAccounts = () => api<DemoAccounts>("/auth/demo-accounts");
export const signInAsDemo = (userId: string) =>
  api<void>("/auth/demo", { method: "POST", body: JSON.stringify({ userId }) });
export const signOut = () => api<void>("/auth/logout", { method: "POST" });
export const getCrews = () => api<Crew[]>("/crews");
export const getJobs = (date?: string) => api<DayOfJobs>(`/jobs${date ? `?date=${date}` : ""}`);
export const getUnscheduledJobs = () => api<JobSummary[]>("/jobs/unscheduled");
export const getOwnerSummary = () => api<OwnerSummary>("/owner/summary");
export const getPortal = (token: string) => api<PortalView>(`/portal/${encodeURIComponent(token)}`);
export const getJob = (id: string) => api<JobDetail>(`/jobs/${id}`);
export const scheduleJob = (id: string, body: { crewId: string; start: string; end: string }) =>
  api<void>(`/jobs/${id}/schedule`, { method: "PATCH", body: JSON.stringify(body) });
export const unscheduleJob = (id: string) => api<void>(`/jobs/${id}/unschedule`, { method: "POST" });
export const changeJobStatus = (id: string, from: JobStatus, to: JobStatus) =>
  api<void>(`/jobs/${id}/status`, { method: "PATCH", body: JSON.stringify({ from, to }) });
