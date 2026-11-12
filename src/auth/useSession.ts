import { useSyncExternalStore } from "react";
import { authClient, authEnabled, hasStoredSession, returningFromEmail } from "./client";

export type Session = { status: "off" } | { status: "checking" } | { status: "out" } | { status: "in"; id: string; email: string };

// one shared session state for the whole page; the client library loads only when there is (or
// may be) a session, so first-time visitors never download it
let state: Session = !authEnabled() ? { status: "off" } : hasStoredSession() || returningFromEmail() ? { status: "checking" } : { status: "out" };
const listeners = new Set<() => void>();
const set = (next: Session) => {
  state = next;
  listeners.forEach((l) => l());
};

let watching = false;
/** starts following the session (sign-in from the email link, sign-out, token refresh) */
export function watchSession(): Promise<void> {
  if (watching || !authEnabled()) return Promise.resolve();
  watching = true;
  return authClient().then(async (c) => {
    c.auth.onAuthStateChange((_event, s) => set(s ? { status: "in", id: s.user.id, email: s.user.email ?? "" } : { status: "out" }));
    const { data } = await c.auth.getSession();
    set(data.session ? { status: "in", id: data.session.user.id, email: data.session.user.email ?? "" } : { status: "out" });
    // the link's tokens are in the hash; they're used, so drop them from the address bar
    if (returningFromEmail()) history.replaceState(null, "", location.pathname + location.search);
  });
}

if (state.status === "checking") watchSession().catch(() => set({ status: "out" }));

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// the sign-in dialog can be opened from anywhere (header, Save)
let dialogOpen = false;
const dialogListeners = new Set<() => void>();
export const setSignInOpen = (open: boolean) => {
  dialogOpen = open;
  dialogListeners.forEach((l) => l());
};
export const useSignInOpen = () =>
  useSyncExternalStore(
    (l) => {
      dialogListeners.add(l);
      return () => dialogListeners.delete(l);
    },
    () => dialogOpen,
  );
