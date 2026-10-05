import { assertHealthy, relativtAvvikProsent } from "./check";
import * as databricks from "./databricks";
import * as databricksMock from "./databricks.mock";
import {
  byttAliasAtomisk,
  docCount,
  es,
  gjørIndeksSøkbar,
  indekserMedAlias,
  lastDokumentstrøm,
  nyttIndeksnavn,
  opprettIndeks,
  slettIndekser,
} from "./elastic";
import { logger } from "./logger";

function kildeForDenneKjøringen() {
  return process.env.DATABRICKS_MOCK === "true" ? databricksMock : databricks;
}

export async function kjørLasting(): Promise<void> {
  const tidspunktForKjøring = new Date();
  const nyIndeks = nyttIndeksnavn(tidspunktForKjøring);
  const timestamp = tidspunktForKjøring.toISOString();
  const kilde = kildeForDenneKjøringen();

  const gamleIndekserAliasetPekerPå = await indekserMedAlias();
  logger.info({ nyIndeks, gamleIndekserAliasetPekerPå }, "starter");

  await opprettIndeks(nyIndeks);
  const bulkStatistikk = await lastDokumentstrøm(nyIndeks, kilde.documents(timestamp));
  logger.info(
    {
      antallDokumenterGodkjent: bulkStatistikk.successful,
      antallDokumenterAvvist: bulkStatistikk.failed,
      antallForsøkPåNytt: bulkStatistikk.retry,
      tidsbrukSekunder: Math.round(bulkStatistikk.time / 1000),
      dataMegabyte: Number((bulkStatistikk.bytes / 1024 / 1024).toFixed(1)),
    },
    "lasting ferdig",
  );

  await gjørIndeksSøkbar(nyIndeks);

  const antallDokumenterINyIndeks = await docCount(nyIndeks);
  const antallDokumenterIForrigeIndeks = gamleIndekserAliasetPekerPå.length
    ? await docCount(gamleIndekserAliasetPekerPå)
    : 0;
  const avvikProsent = relativtAvvikProsent(
    antallDokumenterINyIndeks,
    antallDokumenterIForrigeIndeks,
  );
  logger.info(
    {
      antallDokumenterINyIndeks,
      antallDokumenterIForrigeIndeks,
      avvikProsent: Number(avvikProsent.toFixed(2)),
    },
    "sammenligner med gammel indeks",
  );

  assertHealthy({
    antallGodkjentAvBulkHelper: bulkStatistikk.successful,
    antallAvvistAvElasticsearch: bulkStatistikk.failed,
    antallDokumenterINyIndeks,
    antallDokumenterIForrigeIndeks,
  });

  await byttAliasAtomisk(nyIndeks, gamleIndekserAliasetPekerPå);
  logger.info({ nyIndeks, antallDokumenterINyIndeks }, "alias byttet, ferdig");

  if (gamleIndekserAliasetPekerPå.length) {
    await slettIndekser(gamleIndekserAliasetPekerPå).catch((feilVedSletting) =>
      logger.warn(
        { err: feilVedSletting, gamleIndekserAliasetPekerPå },
        "klarte ikke slette gamle indekser",
      ),
    );
  }
}

export async function lukkKlienter(): Promise<void> {
  await kildeForDenneKjøringen()
    .close()
    .catch((feilVedLukking) => logger.warn({ err: feilVedLukking }, "klarte ikke lukke kilden"));
  await es
    .close()
    .catch((feilVedLukking) =>
      logger.warn({ err: feilVedLukking }, "klarte ikke lukke ES-klienten"),
    );
}
