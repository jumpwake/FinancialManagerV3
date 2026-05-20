import Anthropic from "@anthropic-ai/sdk";

/**
 * Browser-side Anthropic SDK client pointed at our /api/ai proxy.
 * The proxy injects the real API key server-side — the placeholder key
 * here never reaches Anthropic.
 */
export const aiClient = new Anthropic({
  // Absolute URL — the SDK uses new URL() which requires a scheme.
  baseURL: typeof window === "undefined"
    ? "http://localhost/api/ai"  // SSR / test fallback; never hit in the browser
    : `${window.location.origin}/api/ai`,
  apiKey: "browser-placeholder",
  dangerouslyAllowBrowser: true,
});
