import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../records/supabase";

// The Supabase client is only for signing in and saving, so it's loaded on first use and stays
// out of the main bundle. Reading records needs no client (see records/supabase.ts).

export const authEnabled = () => supabaseConfig() !== null;

let client: Promise<SupabaseClient> | null = null;
export function authClient(): Promise<SupabaseClient> {
  const cfg = supabaseConfig();
  if (!cfg) return Promise.reject(new Error("Supabase is not configured"));
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } }),
  );
  return client;
}

/** a session saved by an earlier visit (supabase-js keeps it under sb-<project>-auth-token) */
export function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k));
  } catch {
    return false;
  }
}

/** the email link returns with the session (or an error) in the hash */
export const returningFromEmail = (hash = location.hash) => /(^|[#&])(access_token|error_description)=/.test(hash);

/** emails a sign-in link that returns to this page */
export async function sendSignInLink(email: string): Promise<void> {
  const c = await authClient();
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await (await authClient()).auth.signOut();
}

/** the signed-in user's token for database writes, or null */
export async function accessToken(): Promise<string | null> {
  if (!authEnabled() || !hasStoredSession()) return null;
  const { data } = await (await authClient()).auth.getSession();
  return data.session?.access_token ?? null;
}
