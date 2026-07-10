import { serve } from 'bun';
import { app } from './app';
import {logger} from "./utils/logger";
import {config} from "./config";

serve({
    fetch: app.fetch,
    port: config.port
});

logger.info(`Adresse API listening on http://localhost:${config.port}`);