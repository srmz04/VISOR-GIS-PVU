import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { StorageFactory, RuntimeEnv } from './core/factory';
import { PMTilesService } from './core/pmtiles-service';

/**
 * Definición del entorno para Hono
 */
type Bindings = {
    TILES_BUCKET: any; // R2Bucket type
    LOCAL_TILES_PATH: string;
    STORAGE_TYPE: 'r2' | 'fs';
};

const app = new Hono<{ Bindings: Bindings }>();

// Middlewares Globales
app.use('*', logger());
app.use('*', cors({
    origin: '*',
    allowHeaders: ['Range', 'If-Match', 'If-None-Match'],
    exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Content-Encoding'],
    maxAge: 86400,
}));

// Variable para el servicio (se inicializa en cada request o se reutiliza según el runtime)
// Nota: En Workers, 'env' viene en el contexto del request. En Node, podemos inyectarlo.

/**
 * Helper para obtener el servicio PMTiles configurado según el entorno.
 */
const getService = (c: any) => {
    // Pasar las variables de entorno al Factory
    const adapter = StorageFactory.getAdapter(c.env as RuntimeEnv);
    // Asumimos 'durango.pmtiles' como default, podría venir de env
    return new PMTilesService(adapter, 'durango.pmtiles');
};

// ────────────────────────────────────────────────────────
// Rutas
// ────────────────────────────────────────────────────────

/**
 * Health Check
 */
app.get('/health', async (c) => {
    const service = getService(c);
    const info = await service.getFileInfo();

    return c.json({
        status: 'ok',
        service: 'VISOR-GIS-PVU Vector Tiles',
        storage: info ? 'connected' : 'error',
        file_info: info
    });
});

/**
 * Metadata del tileset
 */
app.get('/metadata', async (c) => {
    try {
        const service = getService(c);
        const header = await service.getHeader();
        const metadata = await service.getMetadata();

        return c.json({ header, metadata });
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

/**
 * Servir Tiles individuales (X/Y/Z)
 */
app.get('/tiles/:z/:x/:y.pbf', async (c) => {
    const z = parseInt(c.req.param('z'));
    const x = parseInt(c.req.param('x'));
    const y = parseInt(c.req.param('y'));

    if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return c.text('Invalid parameters', 400);
    }

    try {
        const service = getService(c);
        const tileData = await service.getTile(z, x, y);

        if (!tileData) {
            return c.text('Tile not found', 404);
        }

        return new Response(tileData, {
            headers: {
                'Content-Type': 'application/x-protobuf',
                'Cache-Control': 'public, max-age=86400, immutable',
            }
        });
    } catch (err: any) {
        console.error(err);
        return c.text(`Internal Error: ${err.message}`, 500);
    }
});

/**
 * Servir archivo PMTiles crudo (soporte para pmtiles://)
 * Soporta Range Requests.
 */
app.get(['/', '/durango.pmtiles'], async (c) => {
    const service = getService(c);
    const rangeHeader = c.req.header('Range');

    try {
        const info = await service.getFileInfo();
        if (!info) return c.text('File not found', 404);

        const contentLength = info.size;
        const etag = info.etag || '';

        // Si es un request con Range
        if (rangeHeader) {
            const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (matches) {
                const start = parseInt(matches[1], 10);
                const end = matches[2] ? parseInt(matches[2], 10) : contentLength - 1;
                const length = end - start + 1;

                const data = await service.getRawBytes(start, length);

                return new Response(data, {
                    status: 206,
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': length.toString(),
                        'Content-Range': `bytes ${start}-${end}/${contentLength}`,
                        'Accept-Ranges': 'bytes',
                        'ETag': etag,
                        'Cache-Control': 'public, max-age=86400, immutable'
                    }
                });
            }
        }

        // Descarga completa (no recomendada para archivos grandes, pero soportada)
        // Nota: En implementaciones reales con R2/S3, mejor hacer stream o redirect presigned,
        // pero para compatibilidad completa lo implementamos via adaptador.

        // ¡CUIDADO! Leer todo el archivo en memoria puede ser costoso.
        // Para R2Adapter es un stream, para FS también.
        // Aquí simplificamos asumiendo uso principal via Range.
        // Si no hay range, denegar o servir stream directo si el adaptador lo soporta (no implementado en interfaz simple)
        return c.text('Please use Range header to access this file efficiently.', 200, {
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength.toString(),
            'ETag': etag
        });

    } catch (err: any) {
        return c.text(`Error: ${err.message}`, 500);
    }
});

export default app;
