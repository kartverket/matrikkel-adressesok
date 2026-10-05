import {
  MAKS_TILLATT_AVVIK_PROSENT_MOT_FORRIGE_INDEKS,
  MINSTE_ANTALL_DOKUMENTER_FOR_VELLYKKET_LASTING,
} from "./config";

export class CheckFailed extends Error {
  override readonly name = "CheckFailed";
}

export function relativtAvvikProsent(nyVerdi: number, forrigeVerdi: number): number {
  if (forrigeVerdi === 0) return nyVerdi === 0 ? 0 : 100;
  return (Math.abs(nyVerdi - forrigeVerdi) / forrigeVerdi) * 100;
}

export interface Counts {
  antallGodkjentAvBulkHelper: number;
  antallAvvistAvElasticsearch: number;
  antallDokumenterINyIndeks: number;
  antallDokumenterIForrigeIndeks: number;
}

export function assertHealthy({
  antallGodkjentAvBulkHelper,
  antallAvvistAvElasticsearch,
  antallDokumenterINyIndeks,
  antallDokumenterIForrigeIndeks,
}: Counts): void {
  if (antallAvvistAvElasticsearch > 0) {
    throw new CheckFailed(`${antallAvvistAvElasticsearch} dokumenter ble avvist`);
  }
  if (antallDokumenterINyIndeks !== antallGodkjentAvBulkHelper) {
    throw new CheckFailed(
      `indeksen har ${antallDokumenterINyIndeks} dokumenter, forventet ${antallGodkjentAvBulkHelper}`,
    );
  }
  if (antallDokumenterINyIndeks < MINSTE_ANTALL_DOKUMENTER_FOR_VELLYKKET_LASTING) {
    throw new CheckFailed(
      `bare ${antallDokumenterINyIndeks} dokumenter, forventet minst ${MINSTE_ANTALL_DOKUMENTER_FOR_VELLYKKET_LASTING}`,
    );
  }

  const avvikProsent = relativtAvvikProsent(
    antallDokumenterINyIndeks,
    antallDokumenterIForrigeIndeks,
  );
  if (
    antallDokumenterIForrigeIndeks > 0 &&
    avvikProsent > MAKS_TILLATT_AVVIK_PROSENT_MOT_FORRIGE_INDEKS
  ) {
    throw new CheckFailed(`${avvikProsent.toFixed(1)} % avvik fra gammel indeks`);
  }
}
