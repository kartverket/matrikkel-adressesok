const indeksSuffixForMiljøIsolasjon = process.env.INDEX_SUFFIX ?? "";

export const ALIAS = `ed_adressesok${indeksSuffixForMiljøIsolasjon}`;
export const INDEX_PREFIX = `ed_adressesok_v1${indeksSuffixForMiljøIsolasjon}`;

export const ANTALL_RADER_PER_PORSJON_FRA_DATABRICKS = 1000;
export const ANTALL_REPLICAS = 1;

export const MAKS_TILLATT_AVVIK_PROSENT_MOT_FORRIGE_INDEKS = 10;
export const MINSTE_ANTALL_DOKUMENTER_FOR_VELLYKKET_LASTING = 1000;

export function hentPåkrevdMiljøvariabel(navn: string): string {
  const verdi = process.env[navn];
  if (!verdi) throw new Error(`Mangler miljøvariabel ${navn}`);
  return verdi;
}
