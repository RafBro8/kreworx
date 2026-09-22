import { deflateSync } from "node:zlib";

/**
 * Photographs for the demo, drawn rather than shipped.
 *
 * A demo that shows off a photo pipeline needs photos, and checking a handful
 * of binaries into the repository to get them is a poor trade. These are
 * generated: dim shapes and a torch beam, which at the size they are shown
 * read as a picture taken in somebody's basement. They are deterministic, so
 * the same job gets the same picture every rebuild.
 */

const WIDTH = 384;
const HEIGHT = 288;

/** A small, fast, repeatable pseudo-random source. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = -1;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Wraps raw RGB pixels as a PNG. No dependency needed: it is four chunks. */
function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // colour type: truecolour
  // 10, 11, 12 stay zero: deflate, adaptive filtering, no interlacing.

  // Every scanline carries a filter byte; 0 means "stored as is", which keeps
  // the encoder to what it needs to be.
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

type Point = [number, number];

type Scene = {
  /** The cabinet or unit being photographed, as four corners: it is never square on. */
  panel: [Point, Point, Point, Point];
  /** The dominant colour of that thing. */
  subject: [number, number, number];
  /** Where the torch is pointing, as a fraction of the frame. */
  beam: Point;
  /** Round fittings - a dial, a cap, a flue collar. */
  discs: { at: Point; radius: number; shade: number }[];
  /** Pipework crossing the frame. */
  pipes: { x: number; width: number; shade: number }[];
};

/** True when the point falls inside the quadrilateral, corners given clockwise. */
function insideQuad(x: number, y: number, quad: Scene["panel"]): boolean {
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = quad[i]!;
    const [bx, by] = quad[(i + 1) % 4]!;
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) return false;
  }
  return true;
}

/**
 * Paints one scene: a dark room, a unit standing at an angle to the camera,
 * pipework across it, and a beam of light falling from where somebody is
 * holding a phone.
 */
function paint(scene: Scene, seed: number): Buffer {
  const random = mulberry32(seed);
  const rgb = Buffer.alloc(WIDTH * HEIGHT * 3);
  const [beamX, beamY] = [scene.beam[0] * WIDTH, scene.beam[1] * HEIGHT];
  const quad = scene.panel.map(([x, y]) => [x * WIDTH, y * HEIGHT] as Point) as Scene["panel"];

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let base: [number, number, number] = [24, 26, 31];
      let shade = 1;

      if (insideQuad(x, y, quad)) {
        base = scene.subject;
        // Seams run with the unit, so they lean with it rather than sitting level.
        const lean = (x - quad[0]![0]) * 0.07;
        if (Math.abs((y + lean) % 52) < 1.6) shade = 0.72;
      }

      for (const pipe of scene.pipes) {
        const centre = pipe.x * WIDTH;
        const half = (pipe.width * WIDTH) / 2;
        const offset = Math.abs(x - centre);
        if (offset < half) {
          base = [92, 96, 102];
          // Round pipes catch the light down one side and fall away on the other.
          shade = pipe.shade * (0.62 + 0.75 * Math.cos((offset / half) * 1.2));
        }
      }

      for (const disc of scene.discs) {
        const distance = Math.hypot(x - disc.at[0] * WIDTH, y - disc.at[1] * HEIGHT);
        const radius = disc.radius * WIDTH;
        if (distance < radius) {
          base = [140, 142, 146];
          shade = disc.shade * (distance > radius * 0.78 ? 0.55 : 0.85 + 0.35 * (1 - distance / radius));
        }
      }

      const toBeam = Math.hypot(x - beamX, y - beamY) / (WIDTH * 0.58);
      const light = Math.max(0.14, 1.32 - toBeam * toBeam * 1.5);
      const toCentre = Math.hypot(x - WIDTH / 2, y - HEIGHT / 2) / (WIDTH * 0.7);
      const vignette = 1 - toCentre * toCentre * 0.62;
      const grain = (Math.round(random() * 3) - 1.5) * 5;

      const index = (y * WIDTH + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        const value = base[c]! * light * vignette * shade + grain;
        rgb[index + c] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }
  }

  return encodePng(WIDTH, HEIGHT, soften(rgb));
}

/**
 * One box blur pass. A phone in a dark basement does not produce hard edges,
 * and softening them compresses better than leaving them sharp.
 */
function soften(rgb: Buffer): Buffer {
  const out = Buffer.alloc(rgb.length);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
            sum += rgb[(ny * WIDTH + nx) * 3 + c]!;
            count += 1;
          }
        }
        out[(y * WIDTH + x) * 3 + c] = Math.round(sum / count);
      }
    }
  }
  return out;
}

export type DemoPhoto = {
  /** The job it belongs to. */
  jobNumber: number;
  caption: string;
  sharedWithCustomer: boolean;
  bytes: Buffer;
};

/**
 * The demo's photographs. Amara's job carries the story: two pictures she can
 * see and one for the office only, which is what proves the portal filters
 * rather than simply listing everything on the job.
 */
export function demoPhotos(): DemoPhoto[] {
  const scenes: { jobNumber: number; caption: string; sharedWithCustomer: boolean; scene: Scene }[] = [
    {
      jobNumber: 4471,
      caption: "Cracked hot-surface ignitor",
      sharedWithCustomer: true,
      scene: {
        panel: [[0.14, 0.2], [0.82, 0.12], [0.88, 0.9], [0.2, 0.82]],
        subject: [104, 88, 76],
        beam: [0.44, 0.52],
        discs: [{ at: [0.62, 0.42], radius: 0.075, shade: 1 }],
        pipes: [{ x: 0.3, width: 0.05, shade: 1 }],
      },
    },
    {
      jobNumber: 4471,
      caption: "Furnace model plate",
      sharedWithCustomer: true,
      scene: {
        panel: [[0.2, 0.26], [0.86, 0.16], [0.9, 0.84], [0.16, 0.78]],
        subject: [112, 116, 122],
        beam: [0.58, 0.38],
        discs: [],
        pipes: [{ x: 0.78, width: 0.06, shade: 0.95 }],
      },
    },
    {
      jobNumber: 4471,
      caption: "Side gate code on the meter cupboard - office only",
      sharedWithCustomer: false,
      scene: {
        panel: [[0.24, 0.14], [0.8, 0.22], [0.76, 0.9], [0.18, 0.8]],
        subject: [74, 88, 80],
        beam: [0.32, 0.6],
        discs: [{ at: [0.45, 0.6], radius: 0.05, shade: 0.9 }],
        pipes: [],
      },
    },
    {
      jobNumber: 4467,
      caption: "Rooftop unit after service",
      sharedWithCustomer: true,
      scene: {
        panel: [[0.1, 0.32], [0.9, 0.22], [0.92, 0.82], [0.08, 0.76]],
        subject: [120, 124, 130],
        beam: [0.5, 0.28],
        discs: [
          { at: [0.32, 0.52], radius: 0.11, shade: 1 },
          { at: [0.72, 0.5], radius: 0.07, shade: 0.85 },
        ],
        pipes: [],
      },
    },
    {
      jobNumber: 4469,
      caption: "Return duct before cleaning",
      sharedWithCustomer: true,
      scene: {
        panel: [[0.06, 0.24], [0.74, 0.14], [0.82, 0.92], [0.12, 0.88]],
        subject: [94, 84, 70],
        beam: [0.54, 0.64],
        discs: [],
        pipes: [
          { x: 0.22, width: 0.07, shade: 0.9 },
          { x: 0.6, width: 0.045, shade: 1 },
        ],
      },
    },
  ];

  return scenes.map(({ scene, ...photo }, index) => ({ ...photo, bytes: paint(scene, 1000 + index * 7) }));
}
