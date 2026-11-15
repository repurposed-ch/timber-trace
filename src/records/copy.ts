import type { DenseSchema } from "densing";
import { randomId } from "../schema/codec";
import { defaultFor } from "../schema/fields";

/** a new component with this record's content: a fresh id, the revision back to its default; everything else as is */
export function copyRecord(schema: DenseSchema, data: any, id: number[] = randomId()): any {
  const revision = schema.fields.find((f) => f.name === "revision");
  return { ...data, id, ...(revision ? { revision: defaultFor(revision, schema) } : {}) };
}
