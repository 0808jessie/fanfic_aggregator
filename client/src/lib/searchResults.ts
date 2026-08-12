export type SearchResult = {
  title: string;
  author: string;
  platform: string;
  url: string;
  tags: string;
  summary: string;
  scraped_at: string;
  source?: string;
  warning?: string;
};

export function isDisplayableResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SearchResult>;
  if (typeof result.url !== "string" || typeof result.platform !== "string") return false;

  const normalizedUrl = result.url.trim().toLowerCase();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) return false;
  if (["example.com", "example.org", "localhost", "127.0.0.1"].some((blocked) => normalizedUrl.includes(blocked))) return false;

  const platform = result.platform.toLowerCase();
  if (platform.includes("ao3")) return normalizedUrl.includes("archiveofourown.org");
  if (platform.includes("lofter")) return normalizedUrl.includes("lofter.com");
  return false;
}

export function normalizeResults(payload: unknown): SearchResult[] {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ("items" in payload
        ? (payload as { items?: unknown }).items
        : "data" in payload
          ? (payload as { data?: unknown }).data
          : [])
      : [];

  if (!Array.isArray(candidates)) return [];
  return candidates.filter(isDisplayableResult) as SearchResult[];
}

export function extractSearchWarning(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("warning" in payload)) return null;
  const warning = (payload as { warning?: unknown }).warning;
  return typeof warning === "string" && warning.trim() ? warning : null;
}
