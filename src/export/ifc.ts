import type { DenseSchema } from "densing";
import { idToHex } from "../schema/codec";
import type { Labels } from "../schema/labels";
import { recordFacts } from "./facts";

// IFC GlobalIds are 128-bit GUIDs written in 22 characters of this alphabet
const IFC64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

const toBig = (parts: number[]) => parts.reduce((acc, p) => (acc << 32n) | BigInt(p >>> 0), 0n);
const fromBig = (n: bigint) => [96n, 64n, 32n, 0n].map((s) => Number((n >> s) & 0xffffffffn));

/** 128-bit id (4 x u32) -> 22-character IFC GlobalId: 2 bits, then 21 x 6 bits */
export function ifcGuid(parts: number[]): string {
  const n = toBig(parts);
  let s = IFC64[Number(n >> 126n)];
  for (let i = 0; i < 21; i++) s += IFC64[Number((n >> BigInt(120 - 6 * i)) & 63n)];
  return s;
}

export function fromIfcGuid(guid: string): number[] {
  if (!/^[0-3][0-9A-Za-z_$]{21}$/.test(guid)) throw new Error(`invalid IFC GlobalId: ${guid}`);
  let n = 0n;
  for (const c of guid) n = (n << 6n) | BigInt(IFC64.indexOf(c));
  return fromBig(n);
}

/** a different, stable GUID per helper entity, derived from the component id */
const derivedGuid = (id: number[], k: number) => ifcGuid(fromBig(toBig(id) ^ (BigInt(k) * 0x9e3779b97f4a7c15f39cc0605cedc835n) % (1n << 128n)));

/** STEP string: quotes doubled, backslash escaped, anything outside printable ASCII as \X2\hhhh\X0\ */
export function stepString(s: string): string {
  let out = "";
  let wide = "";
  const flush = () => {
    if (wide) out += `\\X2\\${wide}\\X0\\`;
    wide = "";
  };
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) {
      flush();
      out += ch === "'" ? "''" : ch === "\\" ? "\\\\" : ch;
    } else {
      // UTF-16 code units, 4 hex digits each
      for (const unit of ch.split("").map((c) => c.charCodeAt(0))) wide += unit.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  flush();
  return `'${out}'`;
}

/** STEP real: always with a decimal point */
const real = (n: number) => (Number.isInteger(n) ? `${n}.` : String(n));

export type IfcInput = {
  slug: string;
  schema: DenseSchema;
  record: any;
  labels: Pick<Labels, "field" | "option">;
  /** base45 payload of the QR code, kept with the beam */
  payload: string;
  /** mm; unknown dimensions come in as defaults with dimensionsKnown = false */
  size: { length: number; width: number; height: number };
  dimensionsKnown: boolean;
  round: boolean;
  /** shown as the beam's name, e.g. "Norway spruce glulam" */
  name: string;
  timestamp?: Date;
};

/** a single IfcBeam in an IFC4 file: project, site, building, storey, geometry, material, property sets */
export function recordToIfc(input: IfcInput): string {
  const { record, size } = input;
  const id: number[] = record.id;
  const idHex = idToHex(id);
  const lines: string[] = [];
  let n = 0;
  const add = (entity: string) => {
    lines.push(`#${++n}=${entity};`);
    return `#${n}`;
  };
  let g = 0;
  const guid = () => stepString(derivedGuid(id, ++g));

  // units: millimetres, as everywhere in timber-trace
  const units = add(
    `IFCUNITASSIGNMENT((${[
      add("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)"),
      add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"),
      add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"),
      add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)"),
    ].join(",")}))`,
  );
  const origin = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const zAxis = add("IFCDIRECTION((0.,0.,1.))");
  const xAxis = add("IFCDIRECTION((1.,0.,0.))");
  const yAxis = add("IFCDIRECTION((0.,1.,0.))");
  const world = add(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`);
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`);
  const project = add(`IFCPROJECT(${guid()},$,'Timber Trace',${stepString(input.slug)},$,$,$,(${context}),${units})`);

  const sitePlace = add(`IFCLOCALPLACEMENT($,${world})`);
  const site = add(`IFCSITE(${guid()},$,'Site',$,$,${sitePlace},$,$,.ELEMENT.,$,$,$,$,$)`);
  const buildingPlace = add(`IFCLOCALPLACEMENT(${sitePlace},${world})`);
  const building = add(`IFCBUILDING(${guid()},$,'Building',$,$,${buildingPlace},$,$,.ELEMENT.,$,$,$)`);
  const storeyPlace = add(`IFCLOCALPLACEMENT(${buildingPlace},${world})`);
  const storey = add(`IFCBUILDINGSTOREY(${guid()},$,'Storey',$,$,${storeyPlace},$,$,.ELEMENT.,0.)`);
  add(`IFCRELAGGREGATES(${guid()},$,$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES(${guid()},$,$,$,${site},(${building}))`);
  add(`IFCRELAGGREGATES(${guid()},$,$,$,${building},(${storey}))`);

  // geometry: the cross-section (width along y, height along z) extruded along x by the length
  const profile = input.round
    ? add(`IFCCIRCLEPROFILEDEF(.AREA.,${stepString(`D${Math.min(size.width, size.height)}`)},$,${real(Math.min(size.width, size.height) / 2)})`)
    : add(`IFCRECTANGLEPROFILEDEF(.AREA.,${stepString(`${size.width}x${size.height}`)},$,${real(size.width)},${real(size.height)})`);
  const sweep = add(`IFCAXIS2PLACEMENT3D(${origin},${xAxis},${yAxis})`);
  const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${sweep},${zAxis},${real(size.length)})`);
  const shape = add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`);
  const productShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${shape}))`);
  const beamPlace = add(`IFCLOCALPLACEMENT(${storeyPlace},${world})`);
  const beam = add(
    `IFCBEAM(${stepString(ifcGuid(id))},$,${stepString(input.name)},${stepString(idHex)},$,${beamPlace},${productShape},${stepString(idHex)},.BEAM.)`,
  );
  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},$,$,$,(${beam}),${storey})`);

  const material = add(`IFCMATERIAL(${stepString(input.labels.option("species", record.species))},$,'wood')`);
  add(`IFCRELASSOCIATESMATERIAL(${guid()},$,$,$,(${beam}),${material})`);

  // property sets: the standard reference, and every fact of the record (unknowns included)
  const prop = (name: string, value: string, description?: string) =>
    add(`IFCPROPERTYSINGLEVALUE(${stepString(name)},${description ? stepString(description) : "$"},${value},$)`);
  const pset = (name: string, props: string[]) => {
    const set = add(`IFCPROPERTYSET(${guid()},$,${stepString(name)},$,(${props.join(",")}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${guid()},$,$,$,(${beam}),${set})`);
  };
  pset("Pset_BeamCommon", [prop("Reference", `IFCIDENTIFIER(${stepString(idHex)})`)]);
  const facts = recordFacts(input.schema, record, input.labels);
  pset("TimberTrace", [
    prop("SchemaSlug", `IFCIDENTIFIER(${stepString(input.slug)})`),
    prop("SchemaVersion", `IFCINTEGER(${record.version})`),
    prop("Payload", `IFCTEXT(${stepString(input.payload)})`, "base45 QR payload"),
    prop("DimensionsKnown", `IFCBOOLEAN(${input.dimensionsKnown ? ".T." : ".F."})`),
    ...facts.map((f) => prop(f.path, `IFCLABEL(${stepString(f.value)})`, f.group ? `${f.group} / ${f.label}` : f.label)),
  ]);

  const stamp = (input.timestamp ?? new Date()).toISOString().slice(0, 19);
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    `FILE_NAME(${stepString(`${input.slug}-${idHex}.ifc`)},'${stamp}',(''),('repurposed'),'timber-trace','timber-trace','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}
