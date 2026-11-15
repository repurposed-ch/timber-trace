import { accessToken } from "../auth/client";
import { currentUserId } from "../auth/useSession";
import { localFirst } from "../local/app";
import { indexedDbStore } from "../local/indexedDbStore";
import { memoryStore } from "../local/store";
import { fallbackSource, staticRecordSource } from "../records/source";
import { supabaseAdmin, supabaseConfig, supabaseRecordSource } from "../records/supabase";
import { idToHex } from "../schema/codec";
import { loadSchema } from "../schema/loader";
import { read } from "./useSchema";

// the database when configured: saves are kept on this device first and sent from there; the
// static files answer what neither knows. The UI only sees RecordSource.
const db = supabaseConfig();
export const local = db
  ? localFirst(typeof indexedDB !== "undefined" ? indexedDbStore() : memoryStore(), supabaseRecordSource(db, undefined, accessToken), currentUserId, (slug) => loadSchema(slug, read))
  : null;
export const records = local ? fallbackSource(local.source, staticRecordSource(read)) : staticRecordSource(read);
// admin calls; the database refuses them for anyone without the admin role
export const adminSource = db ? supabaseAdmin(db, undefined, accessToken) : null;

/** a record's QR code left the app (exported or copied): a revision of it can't be silently renumbered any more */
export const markPrinted = (record: any) => {
  if (local && Array.isArray(record?.id)) local.markPrinted(idToHex(record.id), record.revision?.number ?? null).catch(() => {});
};
