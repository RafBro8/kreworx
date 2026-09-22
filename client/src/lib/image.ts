/**
 * Shrinking a photo before it is uploaded.
 *
 * A phone camera produces four or five megabytes per shot, and none of that
 * detail survives being looked at in a panel or on a portal page. Resizing in
 * the browser means the upload is a couple of hundred kilobytes instead, the
 * server needs no image library, and the person on a van's phone signal is not
 * waiting on a photograph nobody will zoom into.
 */

/** Long edge, in pixels. Comfortably more than any screen shows it at. */
const MAX_EDGE = 1600;

/** JPEG quality. Above this the file grows faster than the picture improves. */
const QUALITY = 0.82;

export type Shrunk = { blob: Blob; resized: boolean };

export async function shrink(file: File): Promise<Shrunk> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough: re-encoding it would only lose detail.
    if (scale === 1 && file.size <= 1_200_000) {
      bitmap.close();
      return { blob: file, resized: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error("canvas produced nothing");
    return { blob, resized: true };
  } catch {
    // No canvas, an image the browser cannot decode, a locked-down webview:
    // send what we were given and let the server decide whether to take it.
    return { blob: file, resized: false };
  }
}
