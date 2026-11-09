// Compact, versioned text payload for beam geometry. All lengths in mm.
// Format: TT1|<id>|<species>|<length>|<width>|<height>|<x,y,d;x,y,d...>

export const VERSION = "TT1";

export type Hole = { x: number; y: number; d: number };

export type Beam = {
  id: string;
  species: string;
  length: number;
  width: number;
  height: number;
  holes: Hole[];
};

const RESERVED = /[|;,]/;

export function encodeBeam(beam: Beam): string {
  for (const s of [beam.id, beam.species]) {
    if (!s || RESERVED.test(s)) throw new Error(`invalid text field: "${s}"`);
  }
  for (const n of [beam.length, beam.width, beam.height]) {
    if (!(n > 0)) throw new Error(`dimension must be positive: ${n}`);
  }
  const holes = beam.holes.map((h) => `${h.x},${h.y},${h.d}`).join(";");
  return [VERSION, beam.id, beam.species, beam.length, beam.width, beam.height, holes].join("|");
}

export function decodeBeam(payload: string): Beam {
  const parts = payload.trim().split("|");
  if (parts[0] !== VERSION) throw new Error(`unsupported version: ${parts[0]}`);
  if (parts.length !== 7) throw new Error(`expected 7 fields, got ${parts.length}`);
  const [, id, species, length, width, height, holes] = parts;
  const num = (s: string) => {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`not a number: "${s}"`);
    return n;
  };
  return {
    id,
    species,
    length: num(length),
    width: num(width),
    height: num(height),
    holes: holes ? holes.split(";").map(parseHole(num)) : [],
  };
}

export function parseHoles(input: string): Hole[] {
  const s = input.trim();
  return s ? s.split(";").map(parseHole(Number)) : [];
}

const parseHole = (num: (s: string) => number) => (h: string): Hole => {
  const [x, y, d] = h.split(",").map((v) => num(v.trim()));
  if ([x, y, d].some((v) => !Number.isFinite(v))) throw new Error(`invalid hole: "${h}"`);
  return { x, y, d };
};
