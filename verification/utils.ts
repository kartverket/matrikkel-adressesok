export type Timed<T> = { time: number; result: T };
export async function measureTime<T>(fn: () => T | Promise<T>): Promise<Timed<T>> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const time = end - start;
  return { time, result };
}

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
