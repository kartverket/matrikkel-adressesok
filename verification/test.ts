import type { Testcase } from "./processlogs";
import { type Instance, runTest } from "./runtest";

const wsGeonorge: Instance = { url: "https://ws.geonorge.no" };
const apiKartverket: Instance = { url: "https://api.test.kartverket.no" };

const testcase: Testcase = {
  method: "GET",
  url: "/adresser/v1/sok?fuzzy=false&sokemodus=AND&kommunenummer=1804&gardsnummer=138&bruksnummer=1968&festenummer=0&utkoordsys=4258&treffPerSide=10&side=0&asciiKompatibel=true",
};
const testcase2: Testcase = {
  method: "GET",
  //url: '/adresser/v1/sok?treffPerSide=100&filtrer=adresser.adressenavn,adresser.adressetekst,adresser.bokstav,adresser.bruksenhetsnummer,adresser.kommunenavn,adresser.kommunenummer,adresser.nummer,adresser.postnummer,adresser.poststed,adresser.representasjonspunkt&fuzzy=true&sok=Lakkegata'
  //url: "/adresser/v1/sok?fuzzy=true&utkoordsys=4258&treffPerSide=10&side=0&asciiKompatibel=true&fuzzy=false&kommunenummer=1508&gardsnummer=560&bruksnummer=45&festenummer=0&undernummer=0",
  url: "/adresser/v1/sok?sok=",
};

const result = await runTest(wsGeonorge, apiKartverket, testcase2);
console.log(result);
if (!result.equalContent) {
}

await Bun.write("original.json", JSON.stringify(result.original.result.content));
await Bun.write("experiment.json", JSON.stringify(result.experiment.result.content));
