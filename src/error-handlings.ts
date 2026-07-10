import {Hono} from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {logger} from "./utils/logger";

export function setupErrorHandling(app: Hono) {
    app.onError((error, c) => {
        if (error instanceof ApiError) {
            return c.json({ message: error.messageBody }, error.status as ContentfulStatusCode);
        }
        const errorString = `
          ${error.name ?? 'Error'}
          ${error.message ?? 'Unknown error'}
          ${error.stack}
        `;
        logger.error(errorString);
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
