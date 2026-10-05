export interface AddressDocument {
  adressenavn?: string | null;
  adressetekst?: string | null;
  adressetilleggsnavn?: string | null;
  adressekode?: number | null;
  nummer?: number | null;
  bokstav?: string | null;
  adresse_kommunenummer?: string | null;
  kommunenummer?: string | null;
  kommunenavn?: string | null;
  gardsnummer?: number | null;
  bruksnummer?: number | null;
  festenummer?: number | null;
  undernummer?: number | null;
  bruksenhetsnummer?: string[] | null;
  objtype?: "Vegadresse" | "Matrikkeladresse" | null;
  poststed?: string | null;
  postnummer?: string | null;
  adressetekstutenadressetilleggsnavn?: string | null;
  stedfestingverifisert?: boolean | null;
  representasjonspunkt?: { epsg?: string; lat: number; lon: number } | null;
  oppdateringsdato?: string | null;
  meterDistanseTilPunkt?: number;
}
