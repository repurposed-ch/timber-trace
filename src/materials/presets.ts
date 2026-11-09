/** visual look of a wood: colours in sRGB hex, frequencies per metre */
export type WoodPreset = {
  base: string;
  late: string;
  /** growth rings per metre of radius */
  rings: number;
  /** latewood contrast 0..1 */
  contrast: number;
  /** chance of a knot per 0.6 m of length, 0..1 */
  knots: number;
  /** ring-porous earlywood pores, 0..1 */
  pores: number;
  /** interlocked ribbon stripes (tropical), 0..1 */
  ribbon: number;
};

const P = (base: string, late: string, rings: number, contrast: number, knots: number, pores = 0, ribbon = 0): WoodPreset => ({
  base, late, rings, contrast, knots, pores, ribbon,
});

export const PRESETS = {
  unknown: P("#bdb9b2", "#a19c94", 200, 0.3, 0),
  spruce: P("#ecd5a8", "#cfa46d", 300, 0.7, 0.55),
  fir: P("#e9d6b4", "#c8a67c", 280, 0.6, 0.45),
  pine: P("#e9c48c", "#b8753b", 220, 0.85, 0.75),
  larch: P("#dfb07c", "#9a5530", 260, 0.9, 0.5),
  cedar: P("#c98c5d", "#8c4c2b", 260, 0.7, 0.35),
  oak: P("#caa46e", "#8f6a3c", 140, 0.6, 0.15, 0.9),
  ash: P("#e2cda4", "#b29468", 130, 0.6, 0.1, 0.8),
  chestnut: P("#c49a66", "#8a6236", 140, 0.6, 0.15, 0.8),
  beech: P("#dfb592", "#c9977a", 150, 0.25, 0.05, 0.1),
  pale: P("#ecdcbc", "#d8c39c", 160, 0.25, 0.1, 0.05),
  alder: P("#d39a6a", "#b77e53", 160, 0.25, 0.1),
  cherry: P("#b9774c", "#94573a", 160, 0.35, 0.05),
  walnut: P("#7a5238", "#4e3324", 150, 0.5, 0.05, 0.3),
  robinia: P("#bfa65c", "#8c7638", 150, 0.6, 0.1, 0.7),
  teak: P("#ad7a45", "#7c5226", 120, 0.45, 0, 0.2, 0.3),
  iroko: P("#a77a3d", "#76521f", 110, 0.35, 0, 0.3, 0.5),
  redTropical: P("#9b4b31", "#6e2f1e", 110, 0.3, 0, 0.3, 0.6),
  okoume: P("#c58f6e", "#a6715a", 120, 0.25, 0, 0.1, 0.4),
  yellowTropical: P("#c99b4a", "#9a7433", 110, 0.3, 0, 0.2, 0.5),
  darkTropical: P("#5e4030", "#3c271c", 110, 0.4, 0, 0.3, 0.4),
  wenge: P("#4a3428", "#24170f", 140, 0.8, 0, 0.4, 0.2),
} satisfies Record<string, WoodPreset>;

export type PresetName = keyof typeof PRESETS;

export const SPECIES_PRESET: Record<string, PresetName> = {
  unknown: "unknown",
  other: "unknown",
  spruce: "spruce",
  sitka_spruce: "spruce",
  silver_fir: "fir",
  western_hemlock: "fir",
  scots_pine: "pine",
  black_pine: "pine",
  maritime_pine: "pine",
  swiss_stone_pine: "pine",
  weymouth_pine: "pine",
  southern_yellow_pine: "pine",
  radiata_pine: "pine",
  larch: "larch",
  douglas_fir: "larch",
  yew: "cedar",
  atlas_cedar: "cedar",
  western_red_cedar: "cedar",
  european_oak: "oak",
  red_oak: "oak",
  white_oak: "oak",
  elm: "oak",
  ash: "ash",
  sweet_chestnut: "chestnut",
  robinia: "robinia",
  beech: "beech",
  plane: "beech",
  maple: "pale",
  sycamore: "pale",
  birch: "pale",
  poplar: "pale",
  lime: "pale",
  hornbeam: "pale",
  alder: "alder",
  eucalyptus: "alder",
  cherry: "cherry",
  walnut: "walnut",
  teak: "teak",
  iroko: "iroko",
  afzelia: "iroko",
  sapele: "redTropical",
  sipo: "redTropical",
  mahogany: "redTropical",
  meranti: "redTropical",
  padauk: "redTropical",
  merbau: "redTropical",
  jatoba: "redTropical",
  massaranduba: "redTropical",
  okoume: "okoume",
  bilinga: "yellowTropical",
  garapa: "yellowTropical",
  cumaru: "yellowTropical",
  bangkirai: "yellowTropical",
  ipe: "darkTropical",
  azobe: "darkTropical",
  wenge: "wenge",
};

export const presetFor = (species: string): WoodPreset => PRESETS[SPECIES_PRESET[species] ?? "unknown"];

/** how the product is built up; picks the shader's layer pattern */
export const PRODUCT_MODE = {
  solid: 0,
  laminated: 1,
  crossLaminated: 2,
  veneer: 3,
  round: 4,
  strand: 5,
} as const;

export function productLayout(product: string): { mode: number; layer: number } {
  switch (product) {
    case "glulam":
    case "block_glulam":
      return { mode: PRODUCT_MODE.laminated, layer: 0.04 };
    case "duo_trio":
      return { mode: PRODUCT_MODE.laminated, layer: 0 }; // 0 = split the height in 3
    case "clt":
      return { mode: PRODUCT_MODE.crossLaminated, layer: 0.03 };
    case "lvl":
      return { mode: PRODUCT_MODE.veneer, layer: 0.003 };
    case "psl":
    case "lsl":
      return { mode: PRODUCT_MODE.strand, layer: 0 };
    case "round":
      return { mode: PRODUCT_MODE.round, layer: 0 };
    default:
      return { mode: PRODUCT_MODE.solid, layer: 0 };
  }
}
