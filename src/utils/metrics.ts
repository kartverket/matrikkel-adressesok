import { Histogram, type HistogramConfiguration } from "prom-client";

export function createHistogram(
  config: Omit<HistogramConfiguration<"status">, "labelNames">,
): Histogram {
  return new Histogram({
    ...config,
    labelNames: ["status"],
  });
}
export async function measureTime<T>(
  histogram: Histogram<"status">,
  fn: () => Promise<T>,
): Promise<T> {
  let status = "ok";
  const stopTimer = histogram.startTimer();
  try {
    return await fn();
  } catch (e: unknown) {
    status = "error";
    throw e;
  } finally {
    stopTimer({ status });
  }
}
