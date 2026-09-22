import { useRef, useState } from "react";

import { deletePhoto, getJobPhotos, photoUrl, uploadJobPhoto } from "../lib/api";
import { shrink } from "../lib/image";
import { useApi } from "../lib/useApi";

/**
 * The photographs on one job, and the way to add another.
 *
 * The picture is taken on a phone and shrunk in the browser before it is sent,
 * so what reaches the server is a couple of hundred kilobytes rather than the
 * five megabytes the camera produced. Whether the customer sees it is decided
 * here, at the moment it is added, because that is when the person knows -
 * a photograph of the meter cupboard is for the office, the cracked part is
 * for the customer.
 */
export default function JobPhotos({ jobId }: { jobId: string }) {
  const photos = useApi(() => getJobPhotos(jobId), jobId);
  const file = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const { reload } = photos;

  async function add(chosen: File) {
    setBusy(true);
    setFailed(null);
    try {
      const { blob } = await shrink(chosen);
      await uploadJobPhoto(jobId, blob, { caption: caption.trim(), share });
      setCaption("");
      reload();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "That photo did not upload");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  async function remove(id: string) {
    setFailed(null);
    try {
      await deletePhoto(id);
      reload();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "That photo could not be removed");
    }
  }

  const list = photos.status === "ready" ? photos.data : [];

  return (
    <div className="flex flex-col gap-3">
      {list.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2" aria-label="Photos on this job">
          {list.map((photo) => (
            <li key={photo.id} className="group relative">
              <img
                src={photoUrl(photo.id)}
                alt={photo.caption ?? "Photo on this job"}
                title={photo.caption ?? undefined}
                loading="lazy"
                className="aspect-4/3 w-full rounded-tile border border-border object-cover"
              />
              {!photo.sharedWithCustomer ? (
                <span className="absolute top-1 left-1 rounded-full bg-canvas/85 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em] text-ink-muted uppercase">
                  Office
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(photo.id)}
                aria-label={`Remove ${photo.caption ?? "photo"}`}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-canvas/85 text-[13px] leading-none text-ink-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2">
        <input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={140}
          placeholder="Caption (optional)"
          aria-label="Photo caption"
          className="h-9 rounded-control border border-border bg-surface px-2.5 text-[13px] placeholder:text-ink-faint"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-muted">
            <input type="checkbox" checked={share} onChange={(event) => setShare(event.target.checked)} />
            Show the customer
          </label>
          <button
            type="button"
            onClick={() => file.current?.click()}
            disabled={busy}
            aria-busy={busy}
            className="h-9 rounded-control border border-border bg-raised px-3 text-[13px] disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Add photo"}
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Choose a photo"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void add(chosen);
          }}
        />
      </div>

      {failed ? (
        <p role="alert" className="text-[12px] text-blocked">
          {failed}
        </p>
      ) : null}
      {photos.status === "error" ? (
        <p role="alert" className="text-[12px] text-blocked">
          {photos.message}
        </p>
      ) : null}
    </div>
  );
}
