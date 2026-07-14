export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(typeof payload === "string" ? payload : JSON.stringify(payload));
    this.name = "HttpError";
  }
}

export function badRequest(message: unknown): never {
  throw new HttpError(400, { message });
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
