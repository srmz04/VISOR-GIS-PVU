import { StorageAdapter } from '../core/storage';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Adaptador de almacenamiento para sistema de archivos local (Linux/Node.js/Bun).
 * Ideal para despliegues self-hosted en servidores Ubuntu.
 */
export class FileSystemAdapter implements StorageAdapter {
    private basePath: string;

    /**
     * @param basePath Ruta absoluta o relativa al directorio de tiles
     */
    constructor(basePath: string) {
        this.basePath = path.resolve(basePath);
    }

    async getBytes(key: string, offset: number, length: number): Promise<Uint8Array> {
        // [SEGURIDAD] Prevenir Path Traversal
        // Asegura que la ruta final esté dentro de basePath
        const safePath = path.resolve(this.basePath, key);
        if (!safePath.startsWith(this.basePath)) {
            throw new Error(`Acceso denegado: Intento de Path Traversal para '${key}'`);
        }

        let fileHandle: fs.FileHandle | null = null;
        try {
            fileHandle = await fs.open(safePath, 'r');
            const buffer = new Uint8Array(length);

            // Leer exactamente el rango solicitado
            const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);

            if (bytesRead < length) {
                // Si leímos menos de lo pedido (final de archivo), devolver solo lo leído
                return buffer.subarray(0, bytesRead);
            }

            return buffer;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                throw new Error(`Archivo no encontrado: ${key}`);
            }
            throw error;
        } finally {
            if (fileHandle) {
                await fileHandle.close();
            }
        }
    }

    async head(key: string): Promise<{ size: number; etag: string | null } | null> {
        const safePath = path.resolve(this.basePath, key);
        if (!safePath.startsWith(this.basePath)) {
            return null;
        }

        try {
            const stats = await fs.stat(safePath);
            return {
                size: stats.size,
                // Generación simple de ETag basado en mtime y tamaño
                etag: `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`
            };
        } catch (error) {
            return null;
        }
    }
}
