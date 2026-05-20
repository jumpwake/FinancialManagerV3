import Anthropic from "@anthropic-ai/sdk";

/**
 * Browser-side Anthropic SDK client pointed at our /api/ai proxy.
 * The proxy injects the real API key server-side — the placeholder key
 * here never reaches Anthropic.
 */
export const aiClient = new Anthropic({
  baseURL: "/api/ai",
  apiKey: "browser-placeholder",
  dangerouslyAllowBrowser: true,
});
