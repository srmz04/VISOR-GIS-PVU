import { serve } from '@hono/node-server';
import app from './app';
import * as path from 'path';

/**
 * Punto de entrada para Servidor Node.js (Ubuntu/Self-hosted).
 * Utiliza @hono/node-server para servir la aplicación.
 */

const port = parseInt(process.env.PORT || '3000');
const tilesPath = process.env.TILES_PATH || './data';

console.log(`[Server] Iniciando en puerto ${port}`);
console.log(`[Server] Sirviendo tiles desde: ${path.resolve(tilesPath)}`);

// Inyectar configuración local al contexto de Hono
// Esto es un shim simple para emular los bindings de Cloudflare en Node
const nodeApp = app.basePath('/'); // Opcional: prefijo si se desea

serve({
    fetch: (req) => {
        // En Node, inyectamos el entorno local en cada request
        return app.fetch(req, {
            LOCAL_TILES_PATH: tilesPath,
            STORAGE_TYPE: 'fs'
        });
    },
    port
}, (info) => {
    console.log(`[Server] Escuchando en http://localhost:${info.port}`);
});
