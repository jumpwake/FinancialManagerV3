import Anthropic from "@anthropic-ai/sdk";
import { appPath } from "../api";

/**
 * Browser-side Anthropic SDK client pointed at our /api/ai proxy.
 * The proxy injects the real API key server-side — the placeholder key
 * here never reaches Anthropic.
 */
export const aiClient = new Anthropic({
  // Absolute URL — the SDK uses new URL() which requires a scheme.
  // appPath() prepends the Vite base so this works both at root and under
  // a sub-path like /finance.
  baseURL: typeof window === "undefined"
    ? "http://localhost/api/ai"  // SSR / test fallback; never hit in the browser
    : `${window.location.origin}${appPath("/api/ai")}`,
  apiKey: "browser-placeholder",
  dangerouslyAllowBrowser: true,
});
