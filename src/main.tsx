import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import posthog from "posthog-js";

posthog.init("phc_oYp3FpSPRHPLCmQY4SP76VbPUkMaAvKfvQ8vszNtZfc2", {
  api_host: "https://us.i.posthog.com",
  capture_pageview: true,
  capture_pageleave: true,
  session_recording: {
    maskAllInputs: false,
  },
});

createRoot(document.getElementById("root")!).render(<App />);
