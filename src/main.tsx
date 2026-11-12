import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { returningFromEmail } from "./auth/client";
import { watchSession } from "./auth/useSession";
import "./styles.css";

// back from the sign-in email: take the session out of the address bar before the pages rewrite it
const ready = returningFromEmail() ? watchSession().catch(() => {}) : Promise.resolve();

ready.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
