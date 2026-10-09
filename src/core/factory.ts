import { StorageAdapter } from './storage';
import { FileSystemAdapter } from '../adapters/fs-adapter';
import { CloudflareAdapter, R2Bucket } from '../adapters/cf-adapter';

/**
 * Entorno de ejecución (Cloudflare o Node.js/Bun)
 */
export interface RuntimeEnv {
    TILES_BUCKET?: R2Bucket;
    LOCAL_TILES_PATH?: string;
    STORAGE_TYPE?: 'r2' | 'fs';
}

/**
 * Fábrica para instanciar el adaptador de almacenamiento correcto
 * según el entorno de despliegue.
 */
export class StorageFactory {
    /**
     * Crea una instancia de StorageAdapter.
     * @param env Variables de entorno o bindings
     */
    static getAdapter(env: RuntimeEnv): StorageAdapter {
        // 1. Prioridad: Definición explícita
        const type = env.STORAGE_TYPE || 'auto';

        if (type === 'r2' && env.TILES_BUCKET) {
            console.log('[StorageFactory] Usando Cloudflare R2 Adapter');
            return new CloudflareAdapter(env.TILES_BUCKET);
        }

        if (type === 'fs' && env.LOCAL_TILES_PATH) {
            console.log('[StorageFactory] Usando FileSystem Adapter');
            return new FileSystemAdapter(env.LOCAL_TILES_PATH);
        }

        // 2. Auto-detección
        if (env.TILES_BUCKET) {
            console.log('[StorageFactory] Detectado R2 Bucket, usando Cloudflare Adapter');
            return new CloudflareAdapter(env.TILES_BUCKET);
        }

        if (env.LOCAL_TILES_PATH) {
            console.log('[StorageFactory] Detectada ruta local, usando FileSystem Adapter');
            return new FileSystemAdapter(env.LOCAL_TILES_PATH);
        }

        // Fallback por defecto para desarrollo local si no se define nada
        // Asume carpeta 'data' en raíz
        console.warn('[StorageFactory] No se detectó configuración, usando fallback local ./data');
        return new FileSystemAdapter('./data');
    }
}
