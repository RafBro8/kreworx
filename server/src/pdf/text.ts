import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * A stream may be deflated with or without a zlib header, or not at all - an
 * uncompressed content stream reads as-is. Try each, rather than assuming.
 */
function inflate(body: Buffer): string {
  for (const attempt of [inflateSync, inflateRawSync]) {
    try {
      return attempt(body).toString("latin1");
    } catch {
      // Not that encoding; fall through.
    }
  }
  return body.toString("latin1");
}

/**
 * The words on a rendered PDF page, for tests.
 *
 * A PDF stores its text in deflated content streams, and pdfkit kerns - so a
 * single word is written as several chunks with spacing between them, and
 * "Northline" can land as (N) -20 (orthline). Inflating every stream and
 * joining the parenthesised runs back up gives the text as a reader sees it,
 * which is what lets a test check that the total really reached the page
 * rather than only that some bytes were produced.
 *
 * This is deliberately not a general PDF parser. It knows just enough about
 * the files this project makes to read them back.
 */
export function textOfPdf(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  let text = "";

  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streams.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;

    const body = Buffer.from(raw.slice(start, end), "latin1");
    const content = inflate(body);

    // pdfkit writes each run as a hex string inside a kerning array:
    // [<4e6f72> -20 <74686c696e65>] TJ. Literal (...) strings appear too, in
    // files produced other ways, so both are read.
    for (const run of content.matchAll(/<([0-9A-Fa-f]+)>|\((?:\\.|[^()\\])*\)/g)) {
      text += run[1]
        ? Buffer.from(run[1], "hex").toString("latin1")
        : run[0].slice(1, -1).replace(/\\(.)/g, "$1");
    }
  }

  return text;
}
