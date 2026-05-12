export interface FindingKeyInput {
  dimension: string;
  type: string;
  ticker?: string;
  label?: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function buildFindingKey(input: FindingKeyInput): string {
  const parts = [slug(input.dimension), slug(input.type)];
  if (input.ticker) parts.push(input.ticker);
  if (input.label) parts.push(slug(input.label));
  return parts.join(":");
}
