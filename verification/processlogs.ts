import { measureTime, type Timed } from "./utils";

export type Testcase = { method: string; url: string };
const httpLineRegexp: RegExp = /"(GET|POST|HEAD) (\S+) HTTP\/.+"/;
function parseLogline(line: string): Testcase {
  const result = httpLineRegexp.exec(line);
  if (result == null) throw new Error(`Could not process line: "${line}"`);
  const [_, capture1, capture2] = result;
  return {
    method: capture1!,
    url: capture2!,
  };
}

type Reducer<TAcc, TEl> = (acc: TAcc, el: TEl, index: number) => TAcc;
function uniqueBy<TEl>(fn: (el: TEl) => any): Reducer<TEl[], TEl> {
  const uniques = new Map<any, boolean>();
  return (acc: TEl[], el: TEl) => {
    const key = fn(el);
    if (uniques.has(key)) return acc;
    uniques.set(key, true);
    acc.push(el);
    return acc;
  };
}

const lines: Timed<string[]> = await measureTime(async () => {
  const content = await Bun.file("container.log").text();
  return content.split("\n");
});
console.log("Reading file", lines.time.toFixed(0), "ms. Lines:", lines.result.length);

const processed: Timed<Testcase[]> = await measureTime(() => {
  return lines.result.filter(Boolean).map(parseLogline);
});
console.log("Processing lines", processed.time.toFixed(0), "ms. Lines:", processed.result.length);

const filtered = await measureTime(() => {
  const callsToApi = processed.result
    .filter((it) => it.method === "GET")
    .filter((it) => it.url !== "/elasticsearch/adressesok/_search")
    .reduce(
      uniqueBy((it) => it.url),
      [],
    );

  return Array.from(new Set(callsToApi));
});
console.log("Filter requests", filtered.time.toFixed(0), "ms. Lines:", filtered.result.length);

const sokCalls = filtered.result
  .filter((it) => it.url.includes("/sok"))
  .sort((a, b) => b.url.length - a.url.length);
const punktsokCalls = filtered.result
  .filter((it) => it.url.includes("/punktsok"))
  .sort((a, b) => b.url.length - a.url.length);

const callsToTest = [
  ...sokCalls.slice(0, 900),
  ...sokCalls.slice(-100),
  ...punktsokCalls.slice(0, 900),
  ...punktsokCalls.slice(-100),
];

const filterAndWrite = await measureTime(async () => {
  const file = Bun.file("cases.jsonl");
  if (await file.exists()) {
    await file.delete();
  }
  const output = file.writer();
  for (const callToApi of callsToTest) {
    output.write(JSON.stringify(callToApi));
    output.write("\n");
  }
  output.flush();
  output.end();
});
console.log("Write testfile", filterAndWrite.time.toFixed(0), "ms.");

export default {};
