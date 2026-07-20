import type { Testcase } from "./processlogs";
import { measureTime, type Timed } from "./utils";
export type Instance = { url: string };

type TestResult = {
  original: Timed<TestResponse>;
  experiment: Timed<TestResponse>;
  equalContent: boolean;
  sameNumberOfHits: boolean;
};

type TestResponse = {
  status: number;
  content: any;
};

const fixes = [
  (body: any) => {
    if ("adresser" in body) {
      body.adresser.sort((a: any, b: any) => {
        const aKey = [
          a.representasjonspunkt?.lat,
          a.representasjonspunkt?.lon,
          a.adressetekst,
        ].join("||");
        const bKey = [
          b.representasjonspunkt?.lat,
          b.representasjonspunkt?.lon,
          b.adressetekst,
        ].join("||");
        return aKey.localeCompare(bKey);
      });
    }
    return body;
  },
  // "adresser[].oppdateringsdato 2020-06-15T16:41:412020-06-15T12:00:0
  (body: any) => {
    if ("adresser" in body) {
      for (const adresse of body.adresser) {
        if ("oppdateringsdato" in adresse) {
          adresse.oppdateringsdato = adresse.oppdateringsdato.replaceAll(
            /(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}/g,
            "$1T12:00:00.000",
          );
        }
      }
    }
    return body;
  },
];

export async function runTest(
  original: Instance,
  experiment: Instance,
  testcase: Testcase,
): Promise<TestResult> {
  const originalCall = await fetchFromInstance(original, testcase);
  const experimentCall = await fetchFromInstance(experiment, testcase);

  const equalContent = Bun.deepEquals(
    originalCall.result.content,
    experimentCall.result.content,
    true,
  );

  const sameNumberOfHits =
    originalCall.result.content.metadata?.totaltAntallTreff ===
    experimentCall.result.content.metadata?.totaltAntallTreff;
  return { original: originalCall, experiment: experimentCall, equalContent, sameNumberOfHits };
}

async function fetchFromInstance(
  instance: Instance,
  testcase: Testcase,
): Promise<Timed<TestResponse>> {
  return measureTime(async () => {
    let url = testcase.url;
    if (url.includes("filtrer=") && !url.includes("metadata")) {
      url = url.replace("filtrer=", "filtrer=metadata,");
    }
    const response = await fetch(`${instance.url}${url}`, {
      method: testcase.method,
    });

    const status = response.status;
    const json = await response.json();
    const fixed = fixes.reduce((b, fix) => fix(b), json);

    return { status, content: fixed };
  });
}
