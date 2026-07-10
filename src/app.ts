import {Hono} from 'hono';
import {logger as requestLogger} from 'hono/logger'
import {swaggerUI} from '@hono/swagger-ui'
import {prometheus} from "@hono/prometheus";
import openapiSpec from './openapi.json';
import {setupErrorHandling} from "./error-handlings";
import {sokHandlerFactory} from "./routes/sok";
import {punktsokHandlerFactory} from "./routes/punktsok";
import {config} from "./config";
import {Client} from "@elastic/elasticsearch";
import {logger} from "./utils/logger";

const baseUrl = '/adresser/v1'
export const app = new Hono().basePath(baseUrl);
setupErrorHandling(app);

const {printMetrics, registerMetrics} = prometheus({collectDefaultMetrics: true})

export const esClient = new Client({
    nodes: [...config.elasticsearch.nodes],
    auth:
        config.elasticsearch.username && config.elasticsearch.password
            ? {
                username: config.elasticsearch.username,
                password: config.elasticsearch.password
            }
            : undefined,
    requestTimeout: config.elasticsearch.requestTimeout
});

app.use('*', registerMetrics);
app.use(requestLogger(logger.info));

// OpenAPI
app.get('/docs.json', (c) => c.json(openapiSpec));
app.get('/openapi.json', (c) => c.json(openapiSpec));
app.get('/', swaggerUI({url: `${baseUrl}/openapi.json`, title: 'Adresser API - Swagger UI'}));
app.get('/index.html', swaggerUI({url: `${baseUrl}/openapi.json`, title: 'Adresser API - Swagger UI'}));

// Kubernetes probes
app.get('/internal/isAlive', (c) => c.text('OK', 200));
app.get('/internal/isReady', (c) => c.text('OK', 200));
app.get('/internal/metrics', printMetrics);

// Endpoints
app.get('/sok', sokHandlerFactory({esClient, index: config.elasticsearch.index}))
app.get('/punktsok', punktsokHandlerFactory({esClient, index: config.elasticsearch.index}))

export default app;
