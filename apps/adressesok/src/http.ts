/**
 * Loggnivå en feil skal logges med, satt av koden som kaster feilen.
 * Dette lar oss skille mellom feil som er forventet klientbruk av APIet
 * (f.eks. ugyldige søkeparametere) og feil som faktisk bør varsles.
 */
export type ErrorLogLevel = "info" | "warn" | "error";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
    public readonly logLevel: ErrorLogLevel = "warn",
  ) {
    super(typeof payload === "string" ? payload : JSON.stringify(payload));
    this.name = "HttpError";
  }
}

/** Ugyldig bruk av APIet (feil/manglende søkeparametere) */
export function badRequest(message: unknown): never {
  throw new HttpError(400, { message }, "info");
}

function escapeNonAscii(json: string): string {
  let escaped = "";
  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);
    if (code <= 0x7f) {
      escaped += json.charAt(index);
    } else {
      escaped += `\\u${code.toString(16).padStart(4, "0")}`;
    }
  }
  return escaped;
}

export function jsonResponse(payload: unknown, status = 200, asciiCompatible = false): Response {
  const json = `${JSON.stringify(payload)}\n`;
  const body = asciiCompatible ? escapeNonAscii(json) : json;
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
