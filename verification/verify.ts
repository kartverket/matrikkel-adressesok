import type { Testcase } from "./processlogs";
import { type Instance, runTest } from "./runtest";
import { delay } from "./utils";

const content = await Bun.file("cases.jsonl").text();
const testcases = Bun.JSONL.parse(content) as Testcase[];

const wsGeonorge: Instance = { url: "https://ws.geonorge.no" };
const apiKartverket: Instance = { url: "https://api.test.kartverket.no" };

let timeGeonorge = 0;
let timeKartverket = 0;
let success = 0;
let warning = 0;
let errors = 0;

for (let i = 0; i < testcases.length; i++) {
  const testcase: Testcase = testcases[i]!;
  try {
    await delay(500);
    const result = await runTest(wsGeonorge, apiKartverket, testcase);

    timeGeonorge += result.original.time;
    timeKartverket += result.experiment.time;
    if (result.equalContent) {
      console.log(
        `[OK-${("" + i).padStart(4, "0")}] ${result.original.time.toFixed(0)}ms - ${result.experiment.time.toFixed(0)}ms`,
      );
      success++;
    } else {
      if (result.sameNumberOfHits) {
        console.warn(
          `[KK-${("" + i).padStart(4, "0")}] ${result.original.time.toFixed(0)}ms - ${result.experiment.time.toFixed(0)}ms`,
        );
        warning++;
      } else {
        console.error(
          `[KO-${("" + i).padStart(4, "0")}] ${result.original.time.toFixed(0)}ms - ${result.experiment.time.toFixed(0)}ms Mismatch in call.`,
        );
        console.error("Status", result.original.result.status, result.experiment.result.status);
        console.error(testcase);
        errors++;
      }
    }
  } catch (e) {
    console.error("Error testing", testcase);
    throw e;
  }
}

console.log(
  `Ran ${success + warning + errors} tests, found ${errors} errors, and ${warning} warnings (same numbers of hits, but potensially different resultset)`,
);
console.log(`Total time used. Base: ${timeGeonorge} Exp: ${timeKartverket}`);
