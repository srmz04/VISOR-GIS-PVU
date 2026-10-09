/**
 * Interfaz fundamental para el almacenamiento de tiles.
 * Permite cambiar entre R2 (Cloudflare) y Sistema de Archivos (Linux/Node)
 * sin tocar la lógica de negocio.
 */
export interface StorageAdapter {
    /**
     * Obtiene un rango de bytes de un archivo específico.
     * Esencial para la lectura eficiente de PMTiles (Range Requests).
     * 
     * @param key Nombre del archivo (ej: "durango.pmtiles")
     * @param offset Byte de inicio
     * @param length Cantidad de bytes a leer
     */
    getBytes(key: string, offset: number, length: number): Promise<Uint8Array>;

    /**
     * Obtiene el tamaño total y metadatos básicos del archivo.
     * @param key Nombre del archivo
     */
    head(key: string): Promise<{ size: number; etag: string | null } | null>;
}
