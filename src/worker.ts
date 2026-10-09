import app from './app';

/**
 * Punto de entrada para Cloudflare Workers.
 * Exporta el manejador fetch que Hono genera.
 */
export default {
    fetch: app.fetch
};
