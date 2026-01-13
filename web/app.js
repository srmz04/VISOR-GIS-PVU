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
        // Inicializar Logger
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

        // Referencias DOM
        this.sidebarEl = document.getElementById('sidebar');

        // Configuración de vista inicial unificada (Estado completo)
        this.initialView = CONFIG.ruralView; // Usar vista amplia por defecto
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
        // Registrar protocolo PMTiles para acceso nativo
        // Esto permite que MapLibre lea directamente el archivo PMTiles
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

        // Timeout de seguridad: Si el mapa no carga en 4 segundos, ocultar loading de todas formas
        setTimeout(() => {
            Logger.warn('App', 'Safety timeout triggered: Forcing hideLoading');
            this.hideLoading();
        }, 4000);

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

        this.sourceLoaded = true;
        Logger.info('MapController', 'Vector tiles source added', { url: tilesBaseUrl });
    }

    getBasemapStyle() {
        const glyphsUrl = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

        return {
            version: 8,
            glyphs: glyphsUrl,
            sources: {
                'esri-satellite': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256
                },
                'esri-labels': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256
                }
            },
            layers: [
                { id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite' },
                { id: 'esri-labels-layer', type: 'raster', source: 'esri-labels' }
            ]
        };
    }

    // =====================================================
    // CAPAS VECTORIALES
    // =====================================================

    addVectorLayer(layerId) {
        // [DEFENSIVE] Verificar explícitamente que la fuente exista en el mapa
        // Esto previene crashes si setStyle eliminó la fuente y aún no se restauraba.
        if (!this.map.getSource('pvu-tiles')) {
            Logger.warn('MapController', 'Source pvu-tiles not found in map style, skipping layer add', { layerId });
            this.sourceLoaded = false;
            return;
        }

        const config = CONFIG.layers[layerId];
        if (!config) {
            Logger.error('MapController', 'Layer config not found', { layerId });
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
                    source: 'pvu-tiles',
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
                    source: 'pvu-tiles',
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
                    source: 'pvu-tiles',
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

        let source = 'pvu-tiles';
        let sourceLayerVal = sourceLayer;
        let minzoom = 5;

        // Configuración específica para GeoJSON (Rural)
        if (config.type === 'geojson') {
            source = `source-${layerId}`;
            sourceLayerVal = undefined; // GeoJSON no usa source-layer
            minzoom = 9; // Visible a partir de zoom 9+
        }

        // Para polígonos (Urbano) usamos CVE_AGEB, para puntos (Rural) usamos NOMLOC
        const labelField = geometryType === 'Point' ? 'NOMLOC' : 'CVE_AGEB';

        const layerDef = {
            id: `${layerId}-label`,
            type: 'symbol',
            source: source,
            layout: {
                'text-field': ['coalesce', ['get', labelField], ['get', 'CVE_AGEB'], ['get', 'NOM_LOC'], ['get', 'NOMLOC'], ''],
                'text-font': ['Noto Sans Regular'],
                'text-size': 11,
                'text-anchor': 'top',
                'text-offset': [0, 0.5],
                'text-allow-overlap': false
            },
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
        const container = document.getElementById('layerControls');
        if (!container) return;

        container.innerHTML = '';

        // Definir grupos principales
        const groups = {
            'URBANO': { label: 'AGEBs URBANAS', active: false },
            'RURAL': { label: 'LOCALIDADES RURALES', active: false }
        };

        // Verificar estado actual para sincronizar botones (si al menos una está on, el grupo "podría" estar activo parcial, pero para simplificar, si hay alguna on, asumimos activo/mixto, si todas off, inactivo)
        // Simplificación: Un botón toggle para cada grupo.

        Object.keys(groups).forEach(groupKey => {
            const groupConfig = groups[groupKey];

            // Contar capas activas en este grupo para decidir estado inicial visual del botón
            const layersInGroup = Object.entries(CONFIG.layers).filter(([_, c]) => c.grupo === groupKey && !c.uiHidden);
            const activeCount = layersInGroup.filter(([id, _]) => this.activeLayers[id]).length;
            const isFullyActive = activeCount === layersInGroup.length;
            const isPartiallyActive = activeCount > 0 && activeCount < layersInGroup.length;

            const btn = document.createElement('div');
            btn.className = `layer-group-toggle ${isFullyActive ? 'active' : ''} ${isPartiallyActive ? 'partial' : ''}`;
            btn.innerHTML = `
                <span class="group-label">${groupConfig.label}</span>
                <span class="group-status">${isFullyActive ? 'ON' : (isPartiallyActive ? '...' : 'OFF')}</span>
            `;

            btn.onclick = () => {
                // Lógica de Toggle: Si hay algo activo, apagar todo. Si todo apagado, encender todo.
                const turnOn = activeCount === 0; // Si está todo apagado, encendemos. Si hay algo (partial o full), apagamos.

                // Excepción: Si es partial, tal vez querramos encender todo primero?
                // UX Standard: Toggle suele ser: Off -> On -> Off. 
                // Si es Partial -> On -> Off parece mejor que Partial -> Off.
                // Decisión: Si no está FULL, poner FULL. Si está FULL, apagar.
                const targetState = !isFullyActive;

                layersInGroup.forEach(([id, _]) => {
                    // Solo actuar si el estado cambia para evitar parpadeos innecesarios
                    if (!!this.activeLayers[id] !== targetState) {
                        this.toggleLayer(id, targetState); // Pasar el estado objetivo explícitamente
                    }
                });

                // toggleLayer llama a updateLegend, pero NO a updateLayerControls recursivamente para evitar loops infinitos si no se maneja bien.
                // Aquí forzamos actualización visual de los botones
                this.updateLayerControls();
            };

            container.appendChild(btn);
        });
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
        this.updateLayerControls();

        // Cargar capas activas por defecto
        Object.entries(CONFIG.layers).forEach(([id, layer]) => {
            // Si es dependiente, su estado depende del controlador, ignorar aquí si se procesa después
            // Pero mejor: verificar si está activo o si su controlador está activo
            let shouldBeActive = this.layerStates[id] || layer.defaultActive;

            if (layer.controlledBy) {
                const controllerId = layer.controlledBy;
                const controllerActive = this.layerStates[controllerId] || CONFIG.layers[controllerId].defaultActive;
                if (controllerActive) shouldBeActive = true;
            }

            if (shouldBeActive) {
                this.addVectorLayer(id);
                this.layerStates[id] = true;
            }
        });

        this.updateLegend();
    }

    updateLayerControls() {
        const container = document.getElementById('layerControls');
        if (!container) return;

        // Limpiar contenedor
        container.innerHTML = '';

        // Definir grupos
        const groups = [
            { id: 'URBANO', title: 'AGEBs Urbanas' },
            { id: 'RURAL', title: 'Localidades Rurales' }
        ];

        groups.forEach(group => {
            const groupHeader = document.createElement('h4');
            groupHeader.className = 'layer-group-title';
            groupHeader.textContent = group.title;
            // Estilo inline simple para el título de grupo (se puede mover a CSS)
            groupHeader.style.marginTop = '15px';
            groupHeader.style.marginBottom = '8px';
            groupHeader.style.fontSize = '0.9rem';
            groupHeader.style.color = '#64748b';
            groupHeader.style.textTransform = 'uppercase';
            groupHeader.style.letterSpacing = '0.05em';

            container.appendChild(groupHeader);

            container.appendChild(groupHeader);

            // Filtrar capas ocultas (uiHidden: true)
            const layers = CONFIG.getLayersByGroup(group.id)
                .filter(([_, layer]) => !layer.uiHidden);

            const groupContainer = document.createElement('div');
            groupContainer.className = 'layer-group-list';

            groupContainer.innerHTML = layers.map(([id, layer]) => `
                <label class="layer-item">
                    <input type="checkbox" 
                           class="layer-checkbox" 
                           data-layer="${id}" 
                           ${this.layerStates[id] ? 'checked' : ''}>
                    <span class="layer-color" style="background-color: ${layer.color}"></span>
                    <span class="layer-name">${layer.nombre}</span>
                </label>
            `).join('');

            container.appendChild(groupContainer);
        });

        // Re-attach event listeners
        container.querySelectorAll('.layer-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                this.toggleLayer(e.target.dataset.layer, e.target.checked);
            });
        });
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
                const name = props.NOMLOC || props.NOM_LOC || props.NOM_MUN || 'Feature';

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

            // [CRITICAL FIX] Verificar que la capa realmente exista en el estilo actual del mapa
            // antes de intentar consultarla, para evitar errores de MapLibre.

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
        const fields = [
            { key: 'INSTITUCION', label: 'Institución' },
            { key: 'INSTITUCI', label: 'Institución' },
            { key: 'NOM_MUN', label: 'Municipio' },
            { key: 'NOM_LOC', label: 'Localidad' },
            { key: 'NOMLOC', label: 'Localidad' },
            { key: 'POBTOT', label: 'Población Total' },
            { key: 'POBFEM', label: 'Población Femenina' },
            { key: 'POBMAS', label: 'Población Masculina' },
            { key: 'JURISDICCION_NUM', label: 'Jurisdicción' },
            { key: 'CVE_MUN', label: 'Clave Municipal' },
            { key: 'CVEGEO9', label: 'Clave Geo' }
        ];

        let html = '<table class="info-table">';

        const displayedKeys = new Set();

        fields.forEach(field => {
            let value = props[field.key];
            if (value !== undefined && value !== null && !displayedKeys.has(field.label)) {
                // [MOD] Unificar SIN_COBERTURA con SSD en metadatos
                if (field.key === 'INSTITUCION' || field.key === 'INSTITUCI') {
                    if (value === 'SIN_COBERTURA' || value === 'SIN COBERTURA' || value === 'JURISDICCION') {
                        value = 'SSD';
                    }
                }

                html += `<tr><th>${field.label}</th><td>${value}</td></tr>`;
                displayedKeys.add(field.label);
            }
        });

        html += '</table>';
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
        if (!query || query.length < 2) {
            document.getElementById('searchResults').innerHTML = '';
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

        const resultsEl = document.getElementById('searchResults');
        if (results.length === 0) {
            resultsEl.innerHTML = '<p class="no-results">No se encontraron resultados</p>';
            return;
        }

        resultsEl.innerHTML = results.map(r => `
            <div class="search-result" data-coords="${JSON.stringify(r.c)}">
                <strong>${r.n}</strong>
                ${r.m ? `<span class="result-mun">${r.m}</span>` : ''}
                ${r.i ? `<span class="result-inst" style="background:${this.getInstColor(r.i)}"></span>` : ''}
            </div>
        `).join('');

        // Event listeners
        resultsEl.querySelectorAll('.search-result').forEach((el, index) => {
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
                    resultsEl.innerHTML = '';
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
        // Toggle de etiquetas
        document.getElementById('globalLabelToggle')?.addEventListener('change', (e) => {
            this.toggleLabels(e.target.checked);
        });

        // Opacidad
        document.getElementById('opacitySlider')?.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 100;
            this.setLayerOpacity(value);
            document.getElementById('opacityValue').textContent = e.target.value;
        });

        // Basemaps - OMITIDO EN VISTA UNIFICADA


        // Búsqueda
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');

        let searchTimeout;
        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.handleSearch(searchInput.value), 300);
        });

        searchBtn?.addEventListener('click', () => this.handleSearch(searchInput?.value));

        // Controles del mapa
        document.getElementById('zoomInBtn')?.addEventListener('click', () => this.map.zoomIn());
        document.getElementById('zoomOutBtn')?.addEventListener('click', () => this.map.zoomOut());
        document.getElementById('resetView')?.addEventListener('click', () => this.resetView());
        document.getElementById('locateBtn')?.addEventListener('click', () => this.locateUser());
        document.getElementById('closeInfo')?.addEventListener('click', () => this.hideInfo());

        // Toggle sidebar
        document.getElementById('menuBtn')?.addEventListener('click', () => this.toggleSidebar());

        // Cerrar sidebar al hacer clic fuera (móvil)
        document.addEventListener('click', (e) => {
            if (window.innerWidth < 768 &&
                this.sidebarEl?.classList.contains('open') &&
                !this.sidebarEl.contains(e.target) &&
                !e.target.closest('#menuBtn')) {
                this.sidebarEl.classList.remove('open');
            }
        });
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
        const titleEl = panel?.querySelector('.info-title');
        const contentEl = panel?.querySelector('.info-content');

        if (titleEl) titleEl.textContent = title;
        if (contentEl) contentEl.innerHTML = content;
        panel?.classList.add('visible');
    }

    hideInfo() {
        document.getElementById('infoPanel')?.classList.remove('visible');
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
