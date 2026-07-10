import {Hono} from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function setupErrorHandling(app: Hono) {
    app.onError((error, c) => {
        if (error instanceof ApiError) {
            return c.json({ message: error.messageBody }, error.status as ContentfulStatusCode);
        }
        console.error(error);
        return c.json({ message: "Internal server error" }, 500);
    });
}

export class ApiError extends Error {
    constructor(public readonly status: number, public readonly messageBody: unknown) {
        super(typeof messageBody === "string" ? messageBody : JSON.stringify(messageBody));
    }
}

export function badRequest(message: unknown): never {
    throw new ApiError(400, message);
}
