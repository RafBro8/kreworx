/**
 * In development VITE_API_URL is unset and Vite proxies /api to the local
 * server; in production it points at the Render service.
 */
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

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

export type Health = {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  commit: string | null;
  database: { connected: boolean; name?: string | null };
};

export const getHealth = () => api<Health>("/health");
