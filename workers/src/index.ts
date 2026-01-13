/**
 * PMTiles Worker - Sirve archivo PMTiles desde R2 con soporte Range
 * 
 * Este Worker sirve:
 * 1. El archivo PMTiles directamente (para protocolo pmtiles://)
 * 2. Tiles individuales extraídos del PMTiles (para URLs /tiles/z/x/y.pbf)
 * 
 * Usa la librería oficial pmtiles para extraer tiles.
 */

import { PMTiles, TileType, Compression } from 'pmtiles';

export interface Env {
    TILES_BUCKET: R2Bucket;
}

// Cache para la instancia de PMTiles (evita recrear en cada request)
let pmtilesInstance: PMTiles | null = null;

// Source personalizado para R2
class R2Source {
    bucket: R2Bucket;
    key: string;

    constructor(bucket: R2Bucket, key: string) {
        this.bucket = bucket;
        this.key = key;
    }

    async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
        const object = await this.bucket.get(this.key, {
            range: { offset, length }
        });
        if (!object) {
            throw new Error('File not found in R2');
        }
        const data = await object.arrayBuffer();
        return { data };
    }

    getKey(): string {
        return this.key;
    }
}

// Función helper para parsear Range headers
function parseRange(rangeHeader: string, contentLength: number): { offset: number; length: number } | null {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) return null;

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : contentLength - 1;

    return {
        offset: start,
        length: end - start + 1
    };
}

// Descompresión de tiles (gzip)
async function decompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
    const ds = new DecompressionStream('gzip');
    const blob = new Blob([data]);
    const decompressedStream = blob.stream().pipeThrough(ds);
    const decompressedBlob = await new Response(decompressedStream).blob();
    return await decompressedBlob.arrayBuffer();
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // Headers CORS para permitir acceso cross-origin
        const corsHeaders: Record<string, string> = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, If-Match, If-None-Match',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Content-Encoding',
        };

        // Preflight CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const PMTILES_KEY = 'durango.pmtiles';

        try {
            // ────────────────────────────────────────────────────────
            // 1. Endpoint de tiles individuales: /tiles/{z}/{x}/{y}.pbf
            // ────────────────────────────────────────────────────────
            const tileMatch = path.match(/^\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
            if (tileMatch) {
                const z = parseInt(tileMatch[1], 10);
                const x = parseInt(tileMatch[2], 10);
                const y = parseInt(tileMatch[3], 10);

                // Inicializar instancia PMTiles si no existe
                if (!pmtilesInstance) {
                    const source = new R2Source(env.TILES_BUCKET, PMTILES_KEY);
                    pmtilesInstance = new PMTiles(source);
                }

                // Obtener tile
                const tileData = await pmtilesInstance.getZxy(z, x, y);

                if (!tileData || !tileData.data) {
                    return new Response('Tile not found', {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                // Servir datos crudos (el archivo PMTiles fue generado sin compresión de tiles)
                const responseData = tileData.data;

                return new Response(responseData, {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/x-protobuf',
                        'Content-Length': responseData.byteLength.toString(),
                        'Cache-Control': 'public, max-age=86400, immutable',
                    }
                });
            }

            // ────────────────────────────────────────────────────────
            // 2. Endpoint de metadata
            // ────────────────────────────────────────────────────────
            if (path === '/metadata') {
                if (!pmtilesInstance) {
                    const source = new R2Source(env.TILES_BUCKET, PMTILES_KEY);
                    pmtilesInstance = new PMTiles(source);
                }

                const header = await pmtilesInstance.getHeader();
                const metadata = await pmtilesInstance.getMetadata();

                return new Response(JSON.stringify({
                    header,
                    metadata
                }, null, 2), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // ────────────────────────────────────────────────────────
            // 3. Servir archivo PMTiles raw (para protocolo pmtiles://)
            // ────────────────────────────────────────────────────────
            if (path === '/durango.pmtiles' || path === '/' || path === '') {
                const rangeHeader = request.headers.get('Range');

                // Primero obtenemos info del objeto para saber el tamaño
                const headObject = await env.TILES_BUCKET.head(PMTILES_KEY);
                if (!headObject) {
                    return new Response('PMTiles file not found', {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                const contentLength = headObject.size;

                // Si hay Range header, servir parcialmente
                if (rangeHeader) {
                    const range = parseRange(rangeHeader, contentLength);
                    if (!range) {
                        return new Response('Invalid Range', {
                            status: 416,
                            headers: corsHeaders
                        });
                    }

                    const object = await env.TILES_BUCKET.get(PMTILES_KEY, {
                        range: { offset: range.offset, length: range.length }
                    });

                    if (!object) {
                        return new Response('File not found', {
                            status: 404,
                            headers: corsHeaders
                        });
                    }

                    const endByte = range.offset + range.length - 1;

                    return new Response(object.body, {
                        status: 206,
                        headers: {
                            ...corsHeaders,
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': range.length.toString(),
                            'Content-Range': `bytes ${range.offset}-${endByte}/${contentLength}`,
                            'Accept-Ranges': 'bytes',
                            'ETag': headObject.etag,
                            'Cache-Control': 'public, max-age=86400, immutable',
                        },
                    });
                }

                // Sin Range: devolver archivo completo
                const object = await env.TILES_BUCKET.get(PMTILES_KEY);
                if (!object) {
                    return new Response('File not found', {
                        status: 404,
                        headers: corsHeaders
                    });
                }

                return new Response(object.body, {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': contentLength.toString(),
                        'Accept-Ranges': 'bytes',
                        'ETag': headObject.etag,
                        'Cache-Control': 'public, max-age=86400, immutable',
                    },
                });
            }

            // ────────────────────────────────────────────────────────
            // 4. Health check endpoint
            // ────────────────────────────────────────────────────────
            if (path === '/health') {
                const object = await env.TILES_BUCKET.head(PMTILES_KEY);
                return new Response(JSON.stringify({
                    status: 'ok',
                    file: PMTILES_KEY,
                    size: object?.size || 0,
                    etag: object?.etag || null
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response('Use /tiles/{z}/{x}/{y}.pbf, /durango.pmtiles, /metadata, or /health', {
                status: 404,
                headers: corsHeaders
            });

        } catch (error) {
            const err = error as Error;
            console.error('Worker Error:', err.message, err.stack);
            return new Response(`Error: ${err.message}`, {
                status: 500,
                headers: corsHeaders
            });
        }
    },
};
