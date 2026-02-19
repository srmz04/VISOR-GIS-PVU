/**
 * PVU WebGIS - Configuración para Vector Tiles (MVT/PMTiles)
 * 
 * Migración de WMS a Vector Tiles:
 * - Fuente: PMTiles servido desde Cloudflare Workers
 * - Capas simplificadas: jurisdicciones unificadas en "SSD"
 * - Estilos dinámicos aplicados en cliente
 */

const CONFIG = {
    // URL del Worker que sirve PMTiles
    tilesUrl: 'https://pvu-tiles-worker.xtrctr.workers.dev',

    // WMS URL (legacy - para fallback si es necesario)
    wmsUrl: 'https://pvu-wms.24je9b5jtac1.us-south.codeengine.appdomain.cloud/wms',

    // Telemetría / Logging
    logging: {
        level: 'INFO',
        ingestionUrl: ''
    },

    // Vista inicial - Estado de Durango
    initialView: {
        center: [-104.67, 24.03],
        zoom: 7
    },

    // Vista para modo URBANO (zonas metropolitanas)
    urbanoView: {
        center: [-104.67, 24.03],
        zoom: 12
    },

    // Vista para modo RURAL (todo el estado)
    ruralView: {
        center: [-105.0, 24.5],
        zoom: 8
    },

    // =====================================================
    // CAPAS MVT - Definición simplificada
    // =====================================================
    layers: {
        // ─────────────────────────────────────────────────
        // MODO URBANO: Polígonos de AGEBs
        // ─────────────────────────────────────────────────
        'urbano_imss_ordinario': {
            sourceLayer: 'urbano_imss_ordinario',
            nombre: 'IMSS Ordinario',
            color: '#D55E00',
            borderColor: '#A04500',
            grupo: 'URBANO',
            geometria: 'Polygon',
            defaultActive: false,
            orden: 1
        },
        'urbano_imss_bienestar': {
            sourceLayer: 'urbano_imss_bienestar',
            nombre: 'IMSS Bienestar',
            color: '#CC78BC',
            borderColor: '#9A5A8C',
            grupo: 'URBANO',
            geometria: 'Polygon',
            defaultActive: false,
            orden: 2
        },
        'urbano_issste': {
            sourceLayer: 'urbano_issste',
            nombre: 'ISSSTE',
            color: '#029E73',
            borderColor: '#017A59',
            grupo: 'URBANO',
            geometria: 'Polygon',
            defaultActive: false,
            orden: 3
        },
        'urbano_ssd': {
            sourceLayer: 'urbano_jurisdiccion',
            nombre: 'SSD',
            color: '#0173B2',
            borderColor: '#015485',
            grupo: 'URBANO',
            geometria: 'Polygon',
            defaultActive: false,
            orden: 4
        },

        // ─────────────────────────────────────────────────
        // MODO RURAL: Puntos de localidades
        // ─────────────────────────────────────────────────
        'rural_imss_bienestar': {
            type: 'geojson',
            url: './data/rural_imss_bienestar.geojson',
            nombre: 'IMSS Bienestar',
            color: '#CC78BC',
            borderColor: '#9A5A8C',
            grupo: 'RURAL',
            geometria: 'Point',
            defaultActive: false,
            orden: 1,
            cluster: true
        },
        'rural_issste': {
            type: 'geojson',
            url: './data/rural_issste.geojson',
            nombre: 'ISSSTE',
            color: '#029E73',
            borderColor: '#017A59',
            grupo: 'RURAL',
            geometria: 'Point',
            defaultActive: false,
            orden: 2,
            cluster: true
        },
        'rural_sin_cobertura': {
            type: 'geojson',
            url: './data/rural_sin_cobertura.geojson',
            nombre: 'Sin Cobertura',
            color: '#0173B2',
            borderColor: '#015485',
            grupo: 'RURAL',
            geometria: 'Point',
            defaultActive: false,
            orden: 3,
            uiHidden: true,
            controlledBy: 'rural_ssd',
            cluster: true
        },
        'rural_ssd': {
            type: 'geojson',
            url: './data/rural_ssd.geojson',
            nombre: 'SSD',
            color: '#0173B2',
            borderColor: '#015485',
            grupo: 'RURAL',
            geometria: 'Point',
            defaultActive: false,
            orden: 4,
            cluster: true
        }
    },

    // Estilos para MVT por tipo de geometría
    mvtStyles: {
        polygon: {
            fillOpacity: 0.7,
            lineWidth: 1
        },
        point: {
            circleRadius: 6,
            circleStrokeColor: '#ffffff',
            circleStrokeWidth: 1.5
        }
    },

    // Helper: obtener capas por grupo
    getLayersByGroup(grupo) {
        return Object.entries(this.layers)
            .filter(([id, layer]) => layer.grupo === grupo)
            .sort((a, b) => a[1].orden - b[1].orden);
    }
};
