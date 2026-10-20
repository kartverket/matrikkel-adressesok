import { INDEX_PREFIX } from "./config";

export function newIndexName(now: Date): string {
  return `${INDEX_PREFIX}-${now.toISOString().replace("T", "-").replace(/[:.]/g, "").replace("Z", "-utc")}`;
}

export function indexTimestamp(index: string): number | null {
  const prefix = `${INDEX_PREFIX}-`;
  if (!index.startsWith(prefix)) return null;

  const suffix = index.slice(prefix.length);
  if (!/^\d{4}-\d{2}-\d{2}-\d{9}-utc$/.test(suffix)) return null;

  const iso = `${suffix.slice(0, 10)}T${suffix.slice(11, 13)}:${suffix.slice(13, 15)}:${suffix.slice(15, 17)}.${suffix.slice(17, 20)}Z`;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date.toISOString() === iso ? date.getTime() : null;
}
