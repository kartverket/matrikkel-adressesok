import { serve } from 'bun';
import { app } from './app';
import {logger} from "./utils/logger";

const port = 9090;
serve({
    fetch: app.fetch,
    port
});

logger.info(`Adresse API listening on http://localhost:${port}`);