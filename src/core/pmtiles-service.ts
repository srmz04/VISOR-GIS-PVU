import { PMTiles } from 'pmtiles';
import { StorageAdapter } from './storage';

/**
 * Servicio para manejar la lógica de PMTiles.
 * Abstrae la librería pmtiles y gestiona la instancia.
 */
export class PMTilesService {
    private instance: PMTiles | null = null;
    private adapter: StorageAdapter;
    private key: string;

    constructor(adapter: StorageAdapter, key: string = 'durango.pmtiles') {
        this.adapter = adapter;
        this.key = key;
    }

    /**
     * Inicializa la instancia de PMTiles si no existe (Lazy Loading).
     */
    private getInstance(): PMTiles {
        if (!this.instance) {
            // Adaptador compatible con la interfaz Source de pmtiles
            const source = {
                getKey: () => this.key,
                getBytes: async (offset: number, length: number) => {
                    const data = await this.adapter.getBytes(this.key, offset, length);
                    return { data: data.buffer as ArrayBuffer };
                }
            };
            this.instance = new PMTiles(source);
        }
        return this.instance;
    }

    /**
     * Obtiene un tile vector (PBF) específico.
     */
    async getTile(z: number, x: number, y: number): Promise<Uint8Array | null> {
        const pmtiles = this.getInstance();
        const result = await pmtiles.getZxy(z, x, y);

        if (!result) return null;
        return new Uint8Array(result.data);
    }

    /**
     * Obtiene la metadata del archivo PMTiles.
     */
    async getMetadata(): Promise<any> {
        const pmtiles = this.getInstance();
        return await pmtiles.getMetadata();
    }

    /**
     * Obtiene el header del archivo PMTiles.
     */
    async getHeader(): Promise<any> {
        const pmtiles = this.getInstance();
        return await pmtiles.getHeader();
    }

    /**
     * Obtiene bytes crudos para servir el archivo completo (Range support).
     */
    async getRawBytes(offset: number, length: number): Promise<Uint8Array> {
        return await this.adapter.getBytes(this.key, offset, length);
    }

    /**
     * Obtiene información del archivo (tamaño, etag) para headers HTTP.
     */
    async getFileInfo(): Promise<{ size: number; etag: string | null } | null> {
        return await this.adapter.head(this.key);
    }
}
