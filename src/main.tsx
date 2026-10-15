import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import posthog from "posthog-js";
import { registerServiceWorker } from "./lib/push";
import { captureFirstTouch } from "./lib/attribution";

posthog.init("phc_oYp3FpSPRHPLCmQY4SP76VbPUkMaAvKfvQ8vszNtZfc2", {
  api_host: "https://us.i.posthog.com",
  capture_pageview: true,
  capture_pageleave: true,
  // Recordings show how people move through the app, never what they type:
  // emails, ages and bios stay out of them. The privacy policy says so.
  session_recording: {
    maskAllInputs: true,
  },
});

// How this browser first found us (utm tags, referrer, shared link), kept until
// she signs up. See lib/attribution.ts.
captureFirstTouch();

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker (Web Push + installable app shell). Fire-and-forget.
registerServiceWorker();
