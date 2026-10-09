import { StorageAdapter } from '../core/storage';

/**
 * Interface para el binding de R2 en Cloudflare Workers
 */
export interface R2Bucket {
    get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
    head(key: string): Promise<R2Object | null>;
}

interface R2Object {
    size: number;
    etag: string;
}

interface R2ObjectBody extends R2Object {
    arrayBuffer(): Promise<ArrayBuffer>;
    body: ReadableStream;
}

/**
 * Adaptador de almacenamiento para Cloudflare R2.
 * Mantiene compatibilidad con el despliegue serverless original.
 */
export class CloudflareAdapter implements StorageAdapter {
    private bucket: R2Bucket;

    constructor(bucket: R2Bucket) {
        this.bucket = bucket;
    }

    async getBytes(key: string, offset: number, length: number): Promise<Uint8Array> {
        // R2 soporta nativamente rangos HTTP
        const object = await this.bucket.get(key, {
            range: { offset, length }
        });

        if (!object) {
            throw new Error(`Objeto '${key}' no encontrado en R2`);
        }

        const buffer = await object.arrayBuffer();
        return new Uint8Array(buffer);
    }

    async head(key: string): Promise<{ size: number; etag: string | null } | null> {
        const object = await this.bucket.head(key);
        if (!object) return null;

        return {
            size: object.size,
            etag: object.etag
        };
    }
}
