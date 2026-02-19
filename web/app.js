/**
 * PVU WebGIS - Visor de Microregionalización (MVT Edition)
 * 
 * Arquitectura: Vector Tiles (PMTiles) servidos desde Cloudflare Workers
 * - Renderizado cliente con MapLibre GL JS
 * - Interactividad nativa (hover, click)
 * - Sin dependencia de servidor WMS
 */

class PVUWebGIS {
    constructor() {
        // Configurar logger si está habilitado en config
        if (typeof Logger !== 'undefined' && CONFIG.logging) {
            Logger.configure(CONFIG.logging);
            Logger.info('App', 'PVU WebGIS MVT Initializing...', {
                tilesUrl: CONFIG.tilesUrl
            });
        }

        this.map = null;
        this.activeLayers = {};
        this.layerStates = {};
        this.showLabels = false;
        this.opacity = 0.8;
        this.popup = null;
        this.sourceLoaded = false;

        // Cache de referencias DOM
        this.sidebarEl = document.getElementById('sidebar');

        // Por defecto usar la vista completa del estado (Rural)
        this.initialView = CONFIG.ruralView;
        this.loadingEl = document.getElementById('loading');

        this.init();
    }

    init() {
        this.initLayerStates();
        this.initMap();
        // No hay listeners de modo o basemap en la vista unificada
        this.initEventListeners();
    }

    // =====================================================
    // MAPA E INICIALIZACIÓN
    // =====================================================

    initLayerStates() {
        Object.entries(CONFIG.layers).forEach(([id, layer]) => {
            this.layerStates[id] = layer.defaultActive;
        });
    }

    initMap() {
        // Registrar el protocolo pmtiles para que MapLibre maneje urls pmtiles:// nativamente
        // Esto evita necesitar un servidor de tiles separado para uso básico
        const protocol = new pmtiles.Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
        Logger.info('MapController', 'PMTiles protocol registered');

        this.map = new maplibregl.Map({
            container: 'map',
            style: this.getBasemapStyle(), // Estilo único Híbrido
            center: [-104.65, 24.02],
            zoom: 11,
            maxZoom: 18,
            minZoom: 5,
            // Necesario para etiquetas: URL de fuentes (glyphs)
            glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf"
        });

        // Controles de navegación
        this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

        // Popup para hover
        this.popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'hover-popup'
        });

        // Failsafe: si el mapa se cuelga, matar la pantalla de carga rápido para no bloquear UX
        setTimeout(() => {
            Logger.warn('App', 'Safety timeout triggered: Forcing hideLoading');
            this.hideLoading();
        }, 1500);

        this.map.on('load', () => {
            Logger.info('MapController', 'Map loaded, adding PMTiles source');
            try {
                this.addTilesSource();
                this.loadUnifiedView();
                this.initHoverInteraction();
            } catch (e) {
                Logger.error('MapController', 'Error initializing map content', e);
            } finally {
                this.hideLoading();
            }
        });

        // Asegurar que se oculte cuando el mapa esté "idle" (ha terminado de renderizar todo)
        this.map.once('idle', () => {
            this.hideLoading();
        });

        this.map.on('error', (e) => {
            const errorMsg = e.error && e.error.message ? e.error.message : 'Unknown error';
            console.error('CRITICAL MAP ERROR:', e.error);
            Logger.error('MapController', 'Map error event', { message: errorMsg });
        });

        this.map.on('click', (e) => this.handleMapClick(e));
    }

    addTilesSource() {
        // Agregar source usando endpoint de tiles individuales
        // El Worker sirve tiles en /tiles/{z}/{x}/{y}.pbf
        const tilesBaseUrl = 'https://pvu-tiles-worker.xtrctr.workers.dev';

        this.map.addSource('pvu-tiles', {
            type: 'vector',
            tiles: [`${tilesBaseUrl}/tiles/{z}/{x}/{y}.pbf`],
            minzoom: 5,
            maxzoom: 14
        });

        // Cargar fuentes adicionales definidas en las capas (ej. PMTiles locales)
        Object.values(CONFIG.layers).forEach(layer => {
            if (layer.source && layer.sourceDef && !this.map.getSource(layer.source)) {
                Logger.info('MapController', `Adding extra source: ${layer.source}`, layer.sourceDef);
                this.map.addSource(layer.source, layer.sourceDef);
            }
        });

        this.sourceLoaded = true;
        Logger.info('MapController', 'Vector tiles source added', { url: tilesBaseUrl });
    }

    getBasemapStyle() {
        const glyphsUrl = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

        return {
            version: 8,
            glyphs: glyphsUrl,
            sources: {
                'esri-street': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256
                }
            },
            layers: [
                { id: 'esri-street-layer', type: 'raster', source: 'esri-street' }
            ]
        };
    }

    // =====================================================
    // CAPAS VECTORIALES
    // =====================================================

    addVectorLayer(layerId) {
        const config = CONFIG.layers[layerId];
        if (!config) {
            Logger.error('MapController', 'Layer config not found', { layerId });
            return;
        }

        // Determinar source (por defecto pvu-tiles)
        const sourceId = config.source || 'pvu-tiles';

        // [DEFENSIVE] Verificar explícitamente que la fuente exista en el mapa
        if (!this.map.getSource(sourceId)) {
            Logger.warn('MapController', `Source ${sourceId} not found in map, skipping layer add`, { layerId });
            return;
        }

        // Delegar a GeoJSON si corresponde
        if (config.type === 'geojson') {
            this.addGeoJSONLayer(layerId);
            return;
        }

        // Verificar si la capa MVT ya existe
        if (this.map.getLayer(`${layerId}-fill`) || this.map.getLayer(`${layerId}-circle`)) {
            return;
        }

        const sourceLayer = config.sourceLayer;
        const opacity = this.opacity;

        try {
            if (config.geometria === 'Polygon') {
                // Capa de relleno
                this.map.addLayer({
                    id: `${layerId}-fill`,
                    type: 'fill',
                    source: sourceId,
                    'source-layer': sourceLayer,
                    paint: {
                        'fill-color': config.color,
                        'fill-opacity': CONFIG.mvtStyles.polygon.fillOpacity * opacity
                    }
                });

                // Capa de borde
                this.map.addLayer({
                    id: `${layerId}-line`,
                    type: 'line',
                    source: sourceId,
                    'source-layer': sourceLayer,
                    paint: {
                        'line-color': config.borderColor,
                        'line-width': CONFIG.mvtStyles.polygon.lineWidth
                    }
                });

                // Capa de etiquetas (opcional)
                if (this.showLabels) {
                    this.addLabelLayer(layerId, sourceLayer, 'Polygon');
                }
            } else {
                // Capa de puntos (círculos)
                this.map.addLayer({
                    id: `${layerId}-circle`,
                    type: 'circle',
                    source: sourceId,
                    'source-layer': sourceLayer,
                    paint: {
                        'circle-color': config.color,
                        'circle-radius': CONFIG.mvtStyles.point.circleRadius,
                        'circle-stroke-width': CONFIG.mvtStyles.point.circleStrokeWidth,
                        'circle-stroke-color': CONFIG.mvtStyles.point.circleStrokeColor,
                        'circle-opacity': opacity
                    }
                });

                if (this.showLabels) {
                    this.addLabelLayer(layerId, sourceLayer, 'Point');
                }
            }
        } catch (e) {
            Logger.error('MapController', 'Error adding vector layer', { layerId, error: e.message });
        }
        this.activeLayers[layerId] = true;
        Logger.info('MapController', `Vector layer added: ${config.nombre}`, { layerId, sourceLayer });
    }

    addGeoJSONLayer(layerId) {
        const config = CONFIG.layers[layerId];
        const sourceId = `source-${layerId}`;

        // 1. Agregar Source si no existe
        if (!this.map.getSource(sourceId)) {
            this.map.addSource(sourceId, {
                type: 'geojson',
                data: config.url,
                cluster: config.cluster || false,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });
        }

        // 2. Capa de Clusters (Círculos)
        // Colores escalonados: Azul (<10), Amarillo (10-30), Rojo (>30) o similar
        // Usando colores del usuario (Azul, Rosa, Verde) como base
        if (!this.map.getLayer(`${layerId}-clusters`)) {
            this.map.addLayer({
                id: `${layerId}-clusters`,
                type: 'circle',
                source: sourceId,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': config.color,
                    'circle-radius': [
                        'step',
                        ['get', 'point_count'],
                        15, // Radio base
                        10, 20,
                        50, 25
                    ],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });
        }

        // 3. Capa de Conteo (Texto en cluster)
        if (!this.map.getLayer(`${layerId}-cluster-count`)) {
            this.map.addLayer({
                id: `${layerId}-cluster-count`,
                type: 'symbol',
                source: sourceId,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['Noto Sans Regular'],
                    'text-size': 12
                },
                paint: {
                    'text-color': '#ffffff'
                }
            });
        }

        // 4. Capa de Puntos Individuales (Unclustered)
        if (!this.map.getLayer(`${layerId}-unclustered-point`)) {
            this.map.addLayer({
                id: `${layerId}-unclustered-point`,
                type: 'circle',
                source: sourceId,
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': config.color,
                    'circle-radius': CONFIG.mvtStyles.point.circleRadius,
                    'circle-stroke-width': CONFIG.mvtStyles.point.circleStrokeWidth,
                    'circle-stroke-color': CONFIG.mvtStyles.point.circleStrokeColor,
                    'circle-opacity': this.opacity
                }
            });
        }

        // Registrar evento de click en cluster para expansión
        // Usamos un listener on-demand para evitar duplicados, o verificamos
        this.map.on('click', `${layerId}-clusters`, (e) => {
            const features = this.map.queryRenderedFeatures(e.point, {
                layers: [`${layerId}-clusters`]
            });
            const clusterId = features[0].properties.cluster_id;
            this.map.getSource(sourceId).getClusterExpansionZoom(
                clusterId,
                (err, zoom) => {
                    if (err) return;
                    this.map.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom: zoom
                    });
                }
            );
        });

        // Cursor pointer en clusters
        this.map.on('mouseenter', `${layerId}-clusters`, () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', `${layerId}-clusters`, () => {
            this.map.getCanvas().style.cursor = '';
        });

        // 5. Capa de Etiquetas (Labels)
        if (this.showLabels) {
            this.addLabelLayer(layerId, undefined, 'Point');
        }

        this.activeLayers[layerId] = true;
        Logger.info('MapController', `GeoJSON layer added: ${config.nombre}`, { layerId });
    }

    addLabelLayer(layerId, sourceLayer, geometryType) {
        const config = CONFIG.layers[layerId];

        let source = config.source || 'pvu-tiles';
        let sourceLayerVal = sourceLayer;
        let minzoom = 5;

        // Configuración específica para GeoJSON (Rural)
        if (config.type === 'geojson') {
            source = `source-${layerId}`;
            sourceLayerVal = undefined; // GeoJSON no usa source-layer
            minzoom = 5; // Restaurar visibilidad (antes era 9)
        }

        // Configuración específica de texto
        let layout = {
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-anchor': 'top',
            'text-offset': [0, 0.5],
            'text-allow-overlap': false
        };

        if (layerId === 'sarampion_notificacion') {
            // [MOD] Etiqueta dual: Conteo Grande + Nombre Pequeño
            layout['text-field'] = [
                'format',
                ['to-string', ['get', 'CASOS_CONFIRMADOS']], { 'font-scale': 1.5, 'text-font': ['Noto Sans Bold'] },
                '\n', {},
                ['get', 'NOM_MUN'], { 'font-scale': 0.8 }
            ];
            // Centrar etiqueta en el polígono
            layout['text-anchor'] = 'center';
            layout['text-offset'] = [0, 0];
        } else {
            // Etiqueta estándar
            // Para polígonos (Urbano) usamos CVE_AGEB, para puntos (Rural) usamos NOMLOC
            const labelField = geometryType === 'Point' ? 'NOMLOC' : 'CVE_AGEB';
            layout['text-field'] = ['coalesce', ['get', labelField], ['get', 'CVE_AGEB'], ['get', 'NOM_LOC'], ['get', 'NOMLOC'], ''];
        }

        const layerDef = {
            id: `${layerId}-label`,
            type: 'symbol',
            source: source,
            layout: layout,
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 1.5
            },
            minzoom: minzoom
        };

        if (sourceLayerVal) {
            layerDef['source-layer'] = sourceLayerVal;
        }

        this.map.addLayer(layerDef);
    }

    removeVectorLayer(layerId) {
        const config = CONFIG.layers[layerId];

        if (config && config.type === 'geojson') {
            // GeoJSON: Remover capas de clustering
            const suffixes = ['-clusters', '-cluster-count', '-unclustered-point'];
            suffixes.forEach(s => {
                if (this.map.getLayer(layerId + s)) this.map.removeLayer(layerId + s);
            });
            // Remover source también para limpiar memoria
            const sourceId = `source-${layerId}`;
            if (this.map.getSource(sourceId)) {
                try {
                    this.map.removeSource(sourceId);
                } catch (e) { /* ignore if used by others */ }
            }
        } else {
            // MVT: Remover capas de estilo
            const suffixes = ['-fill', '-line', '-circle', '-label'];
            suffixes.forEach(suffix => {
                const fullId = `${layerId}${suffix}`;
                if (this.map.getLayer(fullId)) {
                    this.map.removeLayer(fullId);
                }
            });
        }

        delete this.activeLayers[layerId];
        Logger.info('MapController', `Layer removed: ${layerId}`);
    }

    updateLayerControls() {
        // En la nueva UI (Tailwind Sidebar), los controles ya existen en el HTML estático.
        // Solo necesitamos atachar los listeners a los checkboxes existentes.

        // Obtenemos todos los checkboxes con data-layer-id (Urbano y Rural)
        const checkboxes = document.querySelectorAll('#layerControls input[type="checkbox"][data-layer-id]');

        checkboxes.forEach(checkbox => {
            const layerId = checkbox.getAttribute('data-layer-id');

            // Sincronizar estado inicial con el estado de la capa
            checkbox.checked = !!this.layerStates[layerId];

            // Listener para cambios
            checkbox.addEventListener('change', (e) => {
                this.toggleLayer(layerId, e.target.checked);
                this.updateUIState();
            });
        });

        // Etiqueta Global Toggle
        const labelToggle = document.getElementById('globalLabelToggle');
        if (labelToggle) {
            labelToggle.checked = this.showLabels;
            labelToggle.addEventListener('change', (e) => {
                this.toggleLabels(e.target.checked);
            });
        }
    }

    updateUIState() {
        // Actualizar bordes activos u otros elementos visuales si es necesario
        // En la versión Tailwind actual, el checkbox es el único indicador,
        // pero podríamos añadir clases al contenedor padre si quisiéramos.
    }

    toggleLayer(layerId, isActive) {
        this.layerStates[layerId] = isActive;

        const updateState = (id, active) => {
            if (active) {
                this.addVectorLayer(id);
            } else {
                this.removeVectorLayer(id);
            }
        };

        // Actualizar capa principal
        updateState(layerId, isActive);

        // Buscar y actualizar capas dependientes
        Object.entries(CONFIG.layers).forEach(([depId, config]) => {
            if (config.controlledBy === layerId) {
                this.layerStates[depId] = isActive;
                updateState(depId, isActive);
                Logger.info('MapController', `Dependent layer ${depId} toggled with ${layerId}`);
            }
        });

        this.updateLegend();

        // Auto-zoom inteligente para capas epidemiológicas
        // Se activa solo al encender (false → true) si la capa tiene autoZoom: true
        // Calcula la unión de bounds de TODAS las capas EPIDEMIO activas en ese momento,
        // por lo que funciona aunque haya varias capas visibles simultáneamente.
        if (isActive) {
            const activeBoundsAll = Object.entries(this.layerStates)
                .filter(([id, on]) => {
                    const cfg = CONFIG.layers[id];
                    return on && cfg && cfg.grupo === 'EPIDEMIO' && cfg.autoZoom && cfg.bounds;
                })
                .map(([id]) => CONFIG.layers[id].bounds);

            if (activeBoundsAll.length > 0) {
                // Reducción: unión de todos los bounding boxes
                const union = activeBoundsAll.reduce((acc, b) => [
                    Math.min(acc[0], b[0]),  // minLng
                    Math.min(acc[1], b[1]),  // minLat
                    Math.max(acc[2], b[2]),  // maxLng
                    Math.max(acc[3], b[3])   // maxLat
                ]);

                // padding proporcional para dejar aire alrededor de los polígonos
                this.map.fitBounds(union, {
                    padding: { top: 80, bottom: 80, left: 80, right: 80 },
                    maxZoom: 10,   // no acercarse más de zoom 10 aunque los datos sean muy pequeños
                    duration: 800   // animación suave
                });

                Logger.info('MapController', 'Auto-zoom EPIDEMIO activado', { union, capas: activeBoundsAll.length });
            }
        }
    }

    removeAllLayers() {
        Object.keys(this.activeLayers).forEach(layerId => {
            this.removeVectorLayer(layerId);
        });
        this.activeLayers = {};
    }

    setLayerOpacity(opacity) {
        this.opacity = opacity;

        Object.keys(this.activeLayers).forEach(layerId => {
            const config = CONFIG.layers[layerId];
            if (!config) return;

            if (config.type === 'geojson') {
                // GeoJSON: Clusters y Puntos
                const clusterLayer = `${layerId}-clusters`;
                const pointLayer = `${layerId}-unclustered-point`;

                if (this.map.getLayer(clusterLayer)) {
                    this.map.setPaintProperty(clusterLayer, 'circle-opacity', opacity);
                }
                if (this.map.getLayer(pointLayer)) {
                    this.map.setPaintProperty(pointLayer, 'circle-opacity', opacity);
                }
            } else if (config.geometria === 'Polygon') {
                const fillLayer = `${layerId}-fill`;
                if (this.map.getLayer(fillLayer)) {
                    this.map.setPaintProperty(fillLayer, 'fill-opacity',
                        CONFIG.mvtStyles.polygon.fillOpacity * opacity);
                }
            } else {
                const circleLayer = `${layerId}-circle`;
                if (this.map.getLayer(circleLayer)) {
                    this.map.setPaintProperty(circleLayer, 'circle-opacity', opacity);
                }
            }
        });

        Logger.debug('MapController', 'Opacity updated', { opacity });
    }

    // =====================================================
    // MODOS Y CONTROLES
    // =====================================================

    // =====================================================
    // VISTA UNIFICADA
    // =====================================================

    loadUnifiedView() {
        this.removeAllLayers();
        // Sincronizar UI inicial
        this.updateLayerControls();

        // Cargar capas activas por defecto
        Object.entries(CONFIG.layers).forEach(([id, layer]) => {
            if (layer.defaultActive) {
                this.addVectorLayer(id);
            }
        });

        this.updateLegend();
    }

    updateLegend() {
        const legendEl = document.getElementById('legend');
        if (!legendEl) return;

        const activeLayers = Object.entries(CONFIG.layers)
            .filter(([id, layer]) => this.activeLayers[id] && !layer.uiHidden);

        if (activeLayers.length === 0) {
            legendEl.innerHTML = '<p class="legend-empty">Activa capas para ver la leyenda</p>';
            return;
        }

        legendEl.innerHTML = activeLayers.map(([id, layer]) => `
            <div class="legend-item">
                <span class="legend-color" style="background-color: ${layer.color}; 
                    ${layer.geometria === 'Point' ? 'border-radius: 50%;' : ''}"></span>
                <span class="legend-label">${layer.nombre}</span>
            </div>
        `).join('');
    }

    toggleLabels(show) {
        this.showLabels = show;

        Object.keys(this.activeLayers).forEach(layerId => {
            const config = CONFIG.layers[layerId];
            const labelLayerId = `${layerId}-label`;

            if (show) {
                if (!this.map.getLayer(labelLayerId)) {
                    this.addLabelLayer(layerId, config.sourceLayer, config.geometria);
                }
            } else {
                if (this.map.getLayer(labelLayerId)) {
                    this.map.removeLayer(labelLayerId);
                }
            }
        });

        Logger.info('MapController', `Labels ${show ? 'enabled' : 'disabled'}`);
    }

    // =====================================================
    // INTERACTIVIDAD
    // =====================================================

    initHoverInteraction() {
        // Hover para mostrar popup
        this.map.on('mousemove', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, {
                layers: this.getInteractiveLayers()
            });

            if (features.length > 0) {
                this.map.getCanvas().style.cursor = 'pointer';
                const props = features[0].properties;
                // [MOD] Priorizar CVE_AGEB para zonas urbanas, luego NOMLOC para rurales
                const name = props.CVE_AGEB || props.NOMLOC || props.NOM_LOC || props.NOM_MUN || 'Feature';

                this.popup
                    .setLngLat(e.lngLat)
                    .setHTML(`<strong>${name}</strong>`)
                    .addTo(this.map);
            } else {
                this.map.getCanvas().style.cursor = '';
                this.popup.remove();
            }
        });
    }

    getInteractiveLayers() {
        const layers = [];
        Object.keys(this.activeLayers).forEach(layerId => {
            const config = CONFIG.layers[layerId];
            let targetId = '';

            // [Sanity Check] Asegurar que la capa realmente existe en el estilo actual
            // MapLibre explota si consultas una capa inexistente (pasa al cambiar modos)

            if (config.type === 'geojson') {
                // Para GeoJSON, interactuamos con puntos no clusterizados
                targetId = `${layerId}-unclustered-point`;
            } else if (config.geometria === 'Polygon') {
                targetId = `${layerId}-fill`;
            } else {
                targetId = `${layerId}-circle`;
            }

            if (this.map.getLayer(targetId)) {
                layers.push(targetId);
            }
        });
        return layers;
    }

    handleMapClick(e) {
        const features = this.map.queryRenderedFeatures(e.point, {
            layers: this.getInteractiveLayers()
        });

        if (features.length === 0) {
            this.hideInfo();
            return;
        }

        const feature = features[0];
        const props = feature.properties;

        const title = this.getFeatureTitle(props);
        const content = this.formatFeatureInfo(props);

        this.showInfo(title, content);

        Logger.info('Interaction', 'Feature clicked', {
            layer: feature.layer.id,
            properties: props
        });
    }

    getFeatureTitle(props) {
        return props.CVE_AGEB || props.NOMLOC || props.NOM_LOC || props.NOM_MUN || 'Información del Feature';
    }

    formatFeatureInfo(props) {
        // Definición de grupos de metadatos para organizar la información
        const groups = [
            {
                title: null, // Subtítulo eliminado
                fields: [
                    { key: 'INSTITUCION', label: 'Institución' },
                    { key: 'INSTITUCI', label: 'Institución' },
                    { key: 'NOM_MUN', label: 'Municipio' },
                    { key: 'NOM_LOC', label: 'Localidad' },
                    { key: 'NOMLOC', label: 'Localidad' },
                    { key: 'CVE_AGEB', label: 'Clave AGEB' },
                    { key: 'CVE_LOC', label: 'Clave Loc.' },
                    { key: 'CVE_MUN', label: 'Clave Mun.' },
                    { key: 'JURISDICCION_NUM', label: 'Jurisdicción' }
                ]
            },
            {
                title: 'Población General',
                fields: [
                    { key: 'POBTOT', label: 'Población Total' },
                    { key: 'POBFEM', label: 'Mujeres' },
                    { key: 'POBMAS', label: 'Hombres' },
                    { key: 'REL_H_M', label: 'Relación H-M' }
                ]
            },
            {
                title: null, // Subtítulo eliminado
                fields: [
                    { key: 'P_0A2', label: '0 a 2 años' },
                    { key: 'P_3A5', label: '3 a 5 años' },
                    { key: 'POB0_14', label: '0 a 14 años' },
                    { key: 'P_6A11', label: '6 a 11 años' },
                    { key: 'P_8A14', label: '8 a 14 años' },
                    { key: 'P_12A14', label: '12 a 14 años' }
                ]
            },
            {
                title: null, // Subtítulo eliminado
                fields: [
                    { key: 'P_15A17', label: '15 a 17 años' },
                    { key: 'P_18A24', label: '18 a 24 años' },
                    { key: 'POB15_64', label: '15 a 64 años' },
                    { key: 'P_15A49_F', label: 'Mujeres 15-49' }, // Edad fértil
                    { key: 'P_60YMAS', label: '60 años y más' },
                    { key: 'POB65_MAS', label: '65 años y más' }
                ]
            }
        ];

        let html = '<div class="space-y-3">'; // Contenedor con espaciado vertical

        groups.forEach(group => {
            let groupRows = '';
            let displayedLabels = new Set(); // Evitar duplicados (ej: INSTITUCION vs INSTITUCI)

            group.fields.forEach(field => {
                let value = props[field.key];

                // Filtrar valores nulos o vacíos, pero permitir 0 o arteriscos
                if (value !== undefined && value !== null && value !== '' && !displayedLabels.has(field.label)) {

                    // Normalización de Institución
                    if (field.label === 'Institución') {
                        if (['SIN_COBERTURA', 'SIN COBERTURA', 'JURISDICCION'].includes(value)) {
                            value = 'SSD';
                        }
                    }

                    groupRows += `
                        <tr>
                            <th>${field.label}</th>
                            <td>${value}</td>
                        </tr>
                    `;
                    displayedLabels.add(field.label);
                }
            });

            if (groupRows) {
                // Solo mostrar el grupo si tiene al menos un dato
                html += '<div>';

                if (group.title) {
                    html += `<h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 border-b border-slate-100 pb-0.5">${group.title}</h4>`;
                }

                html += `
                        <table class="info-table text-xs">
                            ${groupRows}
                        </table>
                    </div>
                `;
            }
        });

        html += '</div>';
        return html;
    }

    // =====================================================
    // BÚSQUEDA
    // =====================================================

    // =====================================================
    // BÚSQUEDA GLOBAL (Índice JSON)
    // =====================================================

    async initSearchIndex() {
        if (this.searchIndex) return; // Ya cargado

        try {
            Logger.info('Search', 'Loading search index...');
            const response = await fetch('./data/search_index.json');
            if (!response.ok) throw new Error('Failed to load index');
            this.searchIndex = await response.json();
            Logger.info('Search', 'Index loaded', { count: this.searchIndex.length });
        } catch (e) {
            Logger.error('Search', 'Error loading index', e);
            this.searchIndex = []; // Fallback vacío
        }
    }

    handleSearch(query) {
        const resultsEl = document.getElementById('searchResults');
        if (!resultsEl) return;

        if (!query || query.length < 2) {
            resultsEl.innerHTML = '';
            resultsEl.classList.remove('active');
            return;
        }

        const term = query.toLowerCase();

        // Búsqueda exclusiva sobre el índice estático (ahora unificado con Rural + Urbano)
        let results = [];
        if (this.searchIndex) {
            results = this.searchIndex
                .filter(item => {
                    // Buscar en Nombre ("San Juan", "AGEB 0028") y Municipio
                    const name = (item.n || '').toLowerCase();
                    const mun = (item.m || '').toLowerCase();
                    const inst = (item.i || '').toLowerCase();

                    // Prioridad simple: Nombre contiene término O Municipio contiene término
                    return name.includes(term) || mun.includes(term) || inst.includes(term);
                })
                .slice(0, 15); // Límite razonable
        } else {
            // Intento de carga lazy si falló la inicial
            this.initSearchIndex().catch(e => console.warn(e));
        }

        if (results.length === 0) {
            resultsEl.innerHTML = '<div class="search-result-item text-slate-500 italic">No se encontraron resultados</div>';
            resultsEl.classList.add('active');
            return;
        }

        resultsEl.innerHTML = results.map(r => `
            <div class="search-result-item border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors" data-coords="${JSON.stringify(r.c)}">
                <div class="font-medium text-slate-800">${r.n}</div>
                ${r.m ? `<div class="text-xs text-slate-500">${r.m}</div>` : ''}
            </div>
        `).join('');

        resultsEl.classList.add('active');

        // Event listeners
        resultsEl.querySelectorAll('.search-result-item').forEach((el, index) => {
            el.addEventListener('click', () => {
                try {
                    const r = results[index]; // Acceder al objeto de resultado original
                    const coords = JSON.parse(el.dataset.coords);

                    if (coords && coords.length >= 2) {
                        // 1. Activar capa correspondiente si está apagada
                        // Construimos el ID de capa probable: "urbano_imss_bienestar", "rural_ssd", etc.
                        if (r.t && r.i) {
                            const layerId = `${r.t}_${r.i}`.toLowerCase();
                            // Verificamos si existe en la configuración y no está activa
                            if (CONFIG.layers[layerId] && !this.activeLayers[layerId]) {
                                this.toggleLayer(layerId, true); // Activar explícitamente

                                // Actualizar UI de checkboxes
                                const checkbox = document.querySelector(`input[data-layer="${layerId}"]`);
                                if (checkbox) checkbox.checked = true;
                            }
                        }

                        // 2. Volar al objetivo
                        // Zoom más cercano si es urbano (AGEB), más lejano si es rural grande
                        const isUrban = r.t === 'urbano';
                        const zoom = isUrban ? 15 : 13;
                        this.map.flyTo({ center: coords, zoom: zoom, speed: 1.5 });
                    }
                    const input = document.getElementById('searchInput');
                    if (input) input.value = '';
                } catch (e) {
                    Logger.warn('Search', 'Could not navigate to result', { error: e.message });
                }
            });
        });
    }


    getInstColor(inst) {
        // Helper visual para resultados
        // Normalizamos keys para soportar mayúsculas y Title Case
        const map = {
            'IMSS BIENESTAR': '#CC78BC',
            'IMSS Bienestar': '#CC78BC',
            'ISSSTE': '#029E73',
            'SSD': '#0173B2',
            'IMSS ORDINARIO': '#D55E00',
            'IMSS Ordinario': '#D55E00',
            'SIN COBERTURA': '#0173B2',
            'Sin Cobertura': '#0173B2'
        };
        return map[inst] || map[inst.toUpperCase()] || '#aaa';
    }

    // =====================================================
    // BASEMAPS
    // =====================================================

    switchBasemap(basemapId) {
        const currentLayers = { ...this.activeLayers };
        const currentCenter = this.map.getCenter();
        const currentZoom = this.map.getZoom();

        // [CRITICAL] Resetear flag para bloquear intentos de agregar capas mientras carga el estilo
        this.sourceLoaded = false;

        // Registrar listener ANTES del cambio para asegurar captura
        this.map.once('style.load', () => {
            try {
                this.addTilesSource();

                // Restaurar capas activas
                Object.keys(currentLayers).forEach(layerId => {
                    this.addVectorLayer(layerId);
                });

                this.map.setCenter(currentCenter);
                this.map.setZoom(currentZoom);

                Logger.info('MapController', `Basemap switched to: ${basemapId}`);
            } catch (e) {
                Logger.error('MapController', 'Error restoring map state after basemap switch', e);
            }
        });

        this.map.setStyle(this.getBasemapStyle(basemapId));
    }

    // =====================================================
    // EVENT LISTENERS
    // =====================================================

    initEventListeners() {
        // Search Listener
        // Toggle sidebar
        const menuBtn = document.getElementById('menuBtn');
        const sidebar = document.getElementById('sidebar');
        const closeSidebar = document.getElementById('closeSidebar');
        const overlay = document.getElementById('sidebarOverlay');

        const toggleSidebar = (show) => {
            if (show) {
                sidebar.classList.remove('translate-x-full');
                overlay.classList.remove('hidden');
                // Small delay to allow display:block to apply before opacity transition
                setTimeout(() => overlay.classList.remove('opacity-0'), 10);
            } else {
                sidebar.classList.add('translate-x-full');
                overlay.classList.add('opacity-0');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            }
        };

        if (menuBtn) {
            menuBtn.addEventListener('click', () => toggleSidebar(true));
        }
        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => toggleSidebar(false));
        }
        if (overlay) {
            overlay.addEventListener('click', () => toggleSidebar(false));
        }

        // Cerrar sidebar al hacer clic fuera (móvil) - Redundante si tenemos overlay, pero buena práctica
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !sidebar.classList.contains('translate-x-full')) {
                toggleSidebar(false);
            }
        });
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;

        if (searchInput) {
            // Enter key to search immediately
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(searchTimeout);
                    this.handleSearch(e.target.value);
                }
            });

            // Input event for debounce search (type-ahead)
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                // Debounce 300ms
                searchTimeout = setTimeout(() => this.handleSearch(e.target.value), 300);
            });
        }

        // My Location
        const locateBtn = document.getElementById('locateBtn');
        if (locateBtn) {
            locateBtn.addEventListener('click', () => {
                this.map.addControl(new maplibregl.GeolocateControl({
                    positionOptions: { enableHighAccuracy: true },
                    trackUserLocation: true
                }), 'bottom-right');
                // Trigger the click on the geolocate control immediately or just use navigator.geolocation
                // For simplicity, let's fly to Durango Default
                this.map.flyTo({ center: CONFIG.initialView.center, zoom: CONFIG.initialView.zoom });
            });
        }

        // Info Panel Close
        const closeInfoBtn = document.getElementById('closeInfo');
        if (closeInfoBtn) {
            closeInfoBtn.addEventListener('click', () => {
                this.hideInfo();
            });
        }

        // Toggle de etiquetas
        document.getElementById('globalLabelToggle')?.addEventListener('change', (e) => {
            this.toggleLabels(e.target.checked);
        });

        // Control de opacidad (transparencia)
        const opacitySlider = document.getElementById('opacitySlider');
        const opacityValue = document.getElementById('opacityValue');
        if (opacitySlider) {
            // Inicializar con el valor por defecto (80%)
            this.setLayerOpacity(0.8);

            opacitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value, 10);
                if (opacityValue) opacityValue.textContent = `${value}%`;
                this.setLayerOpacity(value / 100);
            });
        }

        // Controles de zoom (si los hubiera en el futuro, por ahora solo están los nativos de maplibre que añadimos en initMap)
        // El nuevo diseño no tiene botones explícitos de zoom en el HTML, usa los controles del mapa.
    }

    // =====================================================
    // UTILIDADES
    // =====================================================

    toggleSidebar() {
        this.sidebarEl?.classList.toggle('open');
    }

    showLoading() {
        this.loadingEl?.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingEl?.classList.add('hidden');
    }

    showInfo(title, content) {
        const panel = document.getElementById('infoPanel');
        if (panel) {
            panel.classList.remove('hidden');
            const contentEl = panel.querySelector('.info-content');
            if (contentEl) contentEl.innerHTML = `<strong>${title}</strong><br/>${content}`;
        }
    }

    hideInfo() {
        const panel = document.getElementById('infoPanel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }

    resetView() {
        const view = this.currentMode === 'URBANO' ? CONFIG.urbanoView : CONFIG.ruralView;
        this.map.flyTo({
            center: view.center,
            zoom: view.zoom,
            duration: 1000
        });
    }

    locateUser() {
        if (!navigator.geolocation) {
            Logger.warn('Geolocation', 'Not supported');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                new maplibregl.Marker({ color: '#e74c3c' })
                    .setLngLat([longitude, latitude])
                    .addTo(this.map);

                this.map.flyTo({
                    center: [longitude, latitude],
                    zoom: 14
                });

                Logger.info('Geolocation', 'User located', { latitude, longitude });
            },
            (error) => {
                Logger.error('Geolocation', 'Error getting location', { error: error.message });
                alert('No se pudo obtener tu ubicación');
            }
        );
    }
}

// Inicializar aplicación
document.addEventListener('DOMContentLoaded', () => {
    window.pvuApp = new PVUWebGIS();
});
