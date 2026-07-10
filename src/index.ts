import { serve } from 'bun';
import { app } from './app';

const port = 9090;
serve({
    fetch: app.fetch,
    port
});

console.log(`Adresse API listening on http://localhost:${port}`);