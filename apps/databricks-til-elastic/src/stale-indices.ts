import { INDEX_PREFIX } from "./config";

export function staleIndicesWithoutAlias(
  indices: Record<string, { aliases?: Record<string, unknown> }>,
  now: Date,
): string[] {
  const cutoff = now.getTime() - 2 * 24 * 60 * 60 * 1000;

  return Object.entries(indices)
    .filter(([index, details]) => {
      if (Object.keys(details.aliases ?? {}).length > 0) return false;
      const createdAt = indexTimestamp(index);
      return createdAt !== null && createdAt <= cutoff;
    })
    .map(([index]) => index);
}

function indexTimestamp(index: string): number | null {
  const prefix = `${INDEX_PREFIX}-`;
  if (!index.startsWith(prefix)) return null;

  const suffix = index.slice(prefix.length);
  if (!/^\d{14}$/.test(suffix)) return null;

  const iso = `${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}T${suffix.slice(8, 10)}:${suffix.slice(10, 12)}:${suffix.slice(12, 14)}.000Z`;
  const date = new Date(iso);
  return !Number.isNaN(date.getTime()) && date.toISOString() === iso ? date.getTime() : null;
}
