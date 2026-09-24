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
  location: { lat: number; lng: number } | null;
};

/** Present only on the demo deployment: which minute of the fast day it is. */
export type DemoClockPayload = { minutes: number; speed: number; endsInSeconds: number } | null;

export type DayOfJobs = { date: string; timezone: string; demo: DemoClockPayload; jobs: JobSummary[] };

export type OwnerSummary = {
  date: string;
  jobsToday: number;
  doneToday: number;
  quotesAwaiting: { count: number; totalCents: number };
  invoicedTodayCents: number;
  invoicedThisWeekCents: number;
};

export const LINE_KINDS = ["part", "labour", "fee"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export type LineItemInput = {
  kind: LineKind;
  description: string;
  detail?: string;
  quantity: number;
  unitPriceCents: number;
  waived?: boolean;
};

/** A line as the server stores it: detail and waived are always present. */
export type StoredLineItem = {
  kind: LineKind;
  description: string;
  detail: string | null;
  quantity: number;
  unitPriceCents: number;
  waived: boolean;
};

export type MoneyDocument = {
  id: string;
  number: number;
  jobId: string;
  status: string;
  findings: string | null;
  lineItems: StoredLineItem[];
  totalCents: number;
  sentAt: string | null;
  respondedAt: string | null;
  validUntil: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

/** A document on the money page, with enough context to read the row. */
export type MoneyRow = MoneyDocument & {
  job: { number: number; title: string } | null;
  customer: string | null;
};

/** One document in its editor. */
export type MoneyDetail = MoneyDocument & {
  job: { id: string; number: number; title: string } | null;
  customer: string | null;
  editable: boolean;
};

export type MoneyBook = { quotes: MoneyRow[]; invoices: MoneyRow[] };

export type CustomerRow = {
  id: string;
  name: string;
  kind: "residential" | "commercial";
  phone: string | null;
  email: string | null;
  /** One town for most; a list for the few with property in several. */
  towns: string[];
  properties: number;
  jobs: number;
  lastVisit: string | null;
  billedCents: number;
};

export type CustomerDetail = {
  id: string;
  name: string;
  kind: "residential" | "commercial";
  phone: string | null;
  email: string | null;
  properties: {
    id: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    accessNotes: string | null;
    equipment: { kind: string; make: string | null; model: string | null; installedYear: number | null }[];
  }[];
  jobs: {
    id: string;
    number: number;
    title: string;
    status: JobStatus;
    scheduledStart: string | null;
    requestedAt: string;
    street: string | null;
    crew: { name: string; van: string } | null;
    invoice: { number: number; status: string; totalCents: number } | null;
    quote: { number: number; status: string; totalCents: number } | null;
  }[];
  billedCents: number;
};

/** A photo, without the photo: enough to show a caption and fetch the bytes. */
export type PhotoSummary = {
  id: string;
  caption: string | null;
  contentType: string;
  bytes: number;
  takenAt: string;
};

export type JobPhoto = PhotoSummary & { sharedWithCustomer: boolean };

/** Where an <img> points for a photo on a staff screen, and on the portal. */
export const photoUrl = (id: string) => `/api/photos/${id}`;
export const portalPhotoUrl = (token: string, id: string) =>
  `/api/portal/${encodeURIComponent(token)}/photos/${id}`;

export type PortalView = {
  company: { name: string; phone: string | null; timezone: string };
  demo: DemoClockPayload;
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
  photos: PhotoSummary[];
  technician: { name: string; title: string | null; years: number | null } | null;
  quote: {
    number: number;
    status: "sent" | "approved" | "declined";
    findings: string | null;
    sentAt: string | null;
    respondedAt: string | null;
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
  quote: { id: string; number: number; status: string; totalCents: number } | null;
  invoice: { id: string; number: number; status: string; totalCents: number } | null;
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
export const resetDemo = () => api<void>("/demo/reset", { method: "POST" });
/**
 * A PDF is fetched by the browser itself, not through `api` - the server sends
 * it as an attachment and the browser saves it.
 */
export const quotePdfUrl = (id: string) => `/api/quotes/${id}/pdf`;
export const invoicePdfUrl = (id: string) => `/api/invoices/${id}/pdf`;
export const portalQuotePdfUrl = (token: string) => `/api/portal/${encodeURIComponent(token)}/quote.pdf`;

export const getMoney = () => api<MoneyBook>("/money");
export const getQuote = (id: string) => api<MoneyDetail>(`/quotes/${id}`);
export const getInvoice = (id: string) => api<MoneyDetail>(`/invoices/${id}`);

type DocumentBody = { findings?: string; lineItems: LineItemInput[] };

export const createQuote = (jobId: string, body: DocumentBody) =>
  api<MoneyDocument>(`/jobs/${jobId}/quote`, { method: "POST", body: JSON.stringify(body) });
export const saveQuote = (id: string, body: DocumentBody) =>
  api<void>(`/quotes/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const sendQuote = (id: string) => api<void>(`/quotes/${id}/send`, { method: "POST" });

/** With no lines, the server bills the approved quote rather than a retyping. */
export const createInvoice = (jobId: string, body?: DocumentBody) =>
  api<MoneyDocument>(`/jobs/${jobId}/invoice`, { method: "POST", body: JSON.stringify(body ?? {}) });
export const saveInvoice = (id: string, body: DocumentBody) =>
  api<void>(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const markInvoicePaid = (id: string) => api<void>(`/invoices/${id}/paid`, { method: "POST" });

export const getCustomers = (q?: string) =>
  api<CustomerRow[]>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const getCustomer = (id: string) => api<CustomerDetail>(`/customers/${id}`);

export const getJobPhotos = (jobId: string) => api<JobPhoto[]>(`/jobs/${jobId}/photos`);
export const deletePhoto = (id: string) => api<void>(`/photos/${id}`, { method: "DELETE" });

/**
 * The image is the whole body. A multipart form would carry one file and a
 * boundary; this carries one file, and the caption travels in the query.
 */
export const uploadJobPhoto = (jobId: string, blob: Blob, options: { caption?: string; share: boolean }) => {
  const query = new URLSearchParams();
  if (options.caption) query.set("caption", options.caption);
  if (!options.share) query.set("share", "false");
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return api<JobPhoto>(`/jobs/${jobId}/photos${suffix}`, {
    method: "POST",
    body: blob,
    headers: { "Content-Type": blob.type || "image/jpeg" },
  });
};

export const answerQuote = (token: string, decision: "approved" | "declined") =>
  api<void>(`/portal/${encodeURIComponent(token)}/quote`, { method: "POST", body: JSON.stringify({ decision }) });
export const getJob = (id: string) => api<JobDetail>(`/jobs/${id}`);
export const scheduleJob = (id: string, body: { crewId: string; start: string; end: string }) =>
  api<void>(`/jobs/${id}/schedule`, { method: "PATCH", body: JSON.stringify(body) });
export const unscheduleJob = (id: string) => api<void>(`/jobs/${id}/unschedule`, { method: "POST" });
export const changeJobStatus = (id: string, from: JobStatus, to: JobStatus) =>
  api<void>(`/jobs/${id}/status`, { method: "PATCH", body: JSON.stringify({ from, to }) });
