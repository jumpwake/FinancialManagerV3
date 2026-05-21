import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the service worker after the page has loaded so it doesn't compete
// with first-paint. The relative path resolves under whatever base the app is
// served at (/sw.js in dev, /finance/sw.js in prod) — keeps the SW scope tight.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swUrl = new URL("sw.js", document.baseURI).toString();
    navigator.serviceWorker
      .register(swUrl)
      .catch((err) => console.warn("SW registration failed:", err));
  });
}
