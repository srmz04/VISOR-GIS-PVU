# PRD — VISOR-GIS-PVU
**Versión:** 2.0 · **Estado:** Alpha activo · **Clasificación:** Uso interno institucional

---

## 1. Propósito y contexto

### 1.1 Problema que resuelve

El Sector Salud de Durango carece de una herramienta centralizada que permita a epidemiólogos y funcionarios visualizar geográficamente:

- Las responsabilidades de vacunación por institución a nivel de AGEB y localidad
- La distribución espacial de casos de enfermedades prevenibles por vacunación (EPV)
- La brecha entre cobertura geográfica de unidades de salud y casos activos de brotes

Actualmente esto requiere cruzar manualmente shapefile en QGIS, CSV del EFES y catálogos INEGI — proceso lento, no reproducible y no accesible para personal sin conocimientos GIS.

### 1.2 Visión del producto

Un visor web institucional, ligero y de alta disponibilidad, que permita a cualquier funcionario de salud de Durango — sin instalar software — consultar responsabilidades de vacunación y situación epidemiológica activa sobre un mapa interactivo, con datos actualizables por el equipo técnico de forma autónoma.

### 1.3 Usuarios objetivo

| Perfil | Frecuencia de uso | Necesidad principal |
|---|---|---|
| Epidemiólogo jurisdiccional | Diario | Monitoreo de brotes activos por municipio |
| Jefe de Jurisdicción Sanitaria | Semanal | Panorama de cobertura y casos confirmados |
| Vacunador / Promotor de salud | Eventual | Identificar localidades de su responsabilidad |
| Dirección de Epidemiología Estatal | Semanal | Toma de decisiones con evidencia geográfica |

---

## 2. Arquitectura del sistema

### 2.1 Stack

| Capa | Tecnología | Justificación |
|---|---|---|
| Frontend | MapLibre GL JS + Vanilla JS + Tailwind CSS | Sin framework pesado; carga rápida en redes lentas |
| Backend | Hono Framework (TypeScript) | Universal: corre en Cloudflare Workers y Node.js sin cambios |
| Formato de tiles | PMTiles v3 | Un solo archivo, sin servidor de tiles, soporte HTTP Range |
| Almacenamiento | Cloudflare R2 (prod) / Filesystem (self-hosted) | Patrón adaptador intercambiable |
| Frontend hosting | Cloudflare Pages | CDN global, sin costo |
| Backend hosting | Cloudflare Workers (prod) · Ubuntu/Node.js (institucional) | Dual-deploy según entorno |
| ETL | Python (geopandas, tippecanoe) | Procesamiento offline de datos geoespaciales |

### 2.2 Flujo de datos

```
CSV EFES (confidencial, local)
        │
        ▼
  [ETL Python]  ──────────────────────────────────────────
  process_sarampion.py                                    │
        │                                                 │
        ▼                                                 ▼
  GeoJSON municipal            Shapefile Municipios (INEGI)
        │                               │
        └──────────── join ─────────────┘
                        │
                        ▼
              GeoJSON enriquecido
              (geometría + metadatos epi)
                        │
                 [tippecanoe]
                        │
                        ▼
                   PMTiles  ──► /web/data/*.pmtiles
                        │
                        ▼
               Mapa (pmtiles:// protocol)
               ← cliente descarga solo tiles visibles
```

### 2.3 Patrón de almacenamiento (Adapter)

```
StorageFactory
  ├── CloudflareAdapter  →  R2Bucket (producción)
  └── FileSystemAdapter  →  /var/lib/pvu-tiles/ (self-hosted)

Auto-detección por variables de entorno:
  STORAGE_TYPE | TILES_BUCKET | LOCAL_TILES_PATH
```

---

## 3. Capas del mapa

### 3.1 Capas epidemiológicas

#### `sarampion_notificacion` — Municipio de Notificación
- **Fuente:** EFES.csv → `CLAS_FINAL_SARAMPION = CONFIRMADO` → municipio notificante
- **Geometría:** Polígonos municipales
- **Color:** Naranja `#FF8C00`
- **Propiedades:** `CASOS_CONFIRMADOS`, `NOM_MUN`, `CVE_MUN`
- **Etiquetas:** Número grande + nombre municipio (siempre visible)
- **Auto-zoom:** Sí (bounds Durango norte-sur)

#### `sarampion_mun_residencia` — Municipio de Residencia
- **Fuente:** EFES.csv → `DES_RESULTADO3 = POSITIVO` + año 2026 → municipio de residencia del paciente
- **Geometría:** Polígonos municipales
- **Color:** Rojo `#E53E3E`
- **Propiedades** (22 campos epidemiológicos):

| Grupo | Campos |
|---|---|
| Totales | `CASOS_CONFIRMADOS` |
| Vacunación | `SIN_VACUNA`, `UNA_DOSIS`, `DOS_DOSIS`, `PCT_SIN_VACUNA` |
| Temporalidad | `PRIMER_CASO`, `ULTIMO_CASO`, `SEM_EPI_INICIO`, `SEM_EPI_ULTIMO` |
| Cadena de tx | `CON_CONTACTO`, `CON_VIAJE`, `DESTINO_VIAJE`, `CONT_EMBARAZADA` |
| Demografía | `MASCULINO`, `FEMENINO`, `MENORES_5`, `MENORES_15`, `EDAD_MEDIANA`, `EDAD_MIN`, `EDAD_MAX` |

### 3.2 Capas de responsabilidades de vacunación — Urbanas (AGEBs)

Servidas como Vector Tiles (MVT) desde `durango.pmtiles` vía endpoint remoto.

| ID | Nombre | Color | Source Layer |
|---|---|---|---|
| `urbano_imss_ordinario` | IMSS Ordinario | `#D55E00` | `urbano_imss_ordinario` |
| `urbano_imss_bienestar` | IMSS Bienestar | `#CC78BC` | `urbano_imss_bienestar` |
| `urbano_issste` | ISSSTE | `#029E73` | `urbano_issste` |
| `urbano_ssd` | SSD | `#0173B2` | `urbano_jurisdiccion` |

### 3.3 Capas de responsabilidades — Rurales (Localidades)

Servidas como GeoJSON con clustering automático.

| ID | Nombre | Color | Fuente |
|---|---|---|---|
| `rural_imss_bienestar` | IMSS Bienestar | `#CC78BC` | `rural_imss_bienestar.geojson` |
| `rural_issste` | ISSSTE | `#029E73` | `rural_issste.geojson` |
| `rural_ssd` | SSD | `#0173B2` | `rural_ssd.geojson` |
| `rural_sin_cobertura` | Sin Cobertura | `#0173B2` | `rural_sin_cobertura.geojson` |

---

## 4. Funcionalidades

### 4.1 Implementadas ✅

#### Control de capas (sidebar)
- Activar / desactivar capas individualmente con checkbox
- Grupos visuales: Epidemiología · AGEBs Urbanas · Localidades Rurales
- Identificador visual de color por institución

#### Opacidad
- Slider 10%–100% (default 80%)
- Se aplica en tiempo real a `fill-opacity` y `circle-opacity`
- No afecta bordes ni etiquetas

#### Etiquetas
- Toggle global para capas AGEB/Rural
- **Capas EPIDEMIO**: siempre visibles, formato dual (número grande + nombre)
- Tipografía: `Noto Sans Regular`, 14px base, texto `#1a1a1a`, halo blanco 2px

#### Auto-zoom inteligente (EPIDEMIO)
- Al activar cualquier capa epidemiológica se hace `fitBounds` a la unión de todas las capas activas
- Padding 80px · maxZoom 10 · animación 800ms
- Si hay dos capas activas simultáneamente calcula la unión de ambos bounds

#### Popup / Panel de información
- **Hover:** Nombre del feature en popup flotante
- **Click:** Panel lateral derecho con contenido estructurado por tipo de capa:
  - **EPIDEMIO:** Tarjeta con 5 secciones (casos, vacunación, transmisión, demografía, temporalidad)
  - **Urbano/Rural:** Tabla con datos censales (POBTOT, POBFEM, POBMAS, grupos de edad)

#### Búsqueda global
- Índice estático `search_index.json` (~5000 localidades)
- Type-ahead con debounce
- Fly-to + activación automática de capa al seleccionar resultado

#### Geolocalización
- Botón "Mi ubicación"
- Marcador puntual + fly-to zoom 14

#### Clustering (capas rurales)
- Agrupación automática de puntos cercanos
- Desagrupación al hacer zoom

#### Logging estructurado
- `logger.js` en frontend: niveles INFO / WARN / ERROR
- Contexto JSON por evento (capa activada, feature clickeado, errores)

### 4.2 Pendientes / Backlog 🔲

| Prioridad | Feature | Descripción |
|---|---|---|
| Alta | **Actualización periódica de datos EFES** | Automatizar el ETL para reejecutar cuando llega nuevo CSV |
| Alta | **Script ETL unificado** | Un solo script que procese ambas capas (notificación + residencia) |
| Alta | **Panel de resumen estatal** | Widget en sidebar: total casos, municipios afectados, % sin vacuna |
| Media | **Curva epidémica por municipio** | Gráfico de casos por semana epidemiológica en el popup |
| Media | **Filtro por semana epidemiológica** | Slider temporal para ver evolución del brote |
| Media | **Exportar datos del popup** | Botón "Descargar CSV" con datos del municipio seleccionado |
| Media | **Mapa de calor (heatmap)** | Visualización alternativa de densidad de casos |
| Baja | **Capas adicionales EPV** | Rubéola, polio, etc. con la misma arquitectura |
| Baja | **Autenticación institucional** | OIDC / Active Directory para acceso restringido |
| Baja | **Dashboard de carga de datos** | Interfaz web para subir CSV sin tocar código |
| Baja | **Vialidades** | Añadir capa de red vial a PMTiles principal |

---

## 5. Estructura de archivos

```
VISOR-GIS-PVU/
├── src/                        # Backend TypeScript
│   ├── app.ts                  # Rutas Hono universales
│   ├── worker.ts               # Entry point Cloudflare Workers
│   ├── server.ts               # Entry point Node.js
│   └── core/
│       ├── storage.ts          # Interface StorageAdapter
│       ├── factory.ts          # StorageFactory + auto-detección
│       ├── pmtiles-service.ts  # getTile, getMetadata
│       └── logger.ts           # Logger backend (pendiente integrar)
│
├── web/                        # Frontend estático
│   ├── index.html              # Estructura HTML + CDN imports
│   ├── config.js               # Definición de todas las capas
│   ├── app.js                  # Lógica MapLibre (clase PVUWebGIS)
│   ├── logger.js               # Logging frontend estructurado
│   └── data/
│       ├── search_index.json   # Índice de búsqueda (~894 KB)
│       ├── epidemio_meta.json  # Bounds y metadatos por capa epi
│       ├── sarampion_municipios.{geojson,pmtiles}
│       ├── sarampion_mun_residencia.{geojson,pmtiles}
│       └── rural_*.geojson
│
├── scripts/
│   ├── process_sarampion.py    # ETL: CSV → GeoJSON → PMTiles
│   ├── deploy.sh               # Despliegue Ubuntu
│   └── install.sh              # Instalación de dependencias
│
├── config/
│   ├── pvu-tiles.service       # Systemd unit (self-hosted)
│   └── nginx-pvu-tiles.conf    # Reverse proxy
│
├── data/
│   ├── PRD.md                  # Este documento
│   ├── tiles/
│   │   ├── durango.pmtiles     # Tiles principales (27 MB)
│   │   └── durango.mbtiles     # Backup MBTiles (16 MB)
│   └── geojson/
│       └── *.geojson           # GeoJSON fuente por institución
│
├── _geodata/                   # Datos fuente INEGI (local, no versionados)
│   └── Marco_Geoestadistico/
│       ├── Municipios.shp
│       ├── Ageb_Urbano/Rural CPV2020
│       └── Localidades_*/Red_Vial
│
└── VISOR-EPI/                  # Datos EFES confidenciales (no versionados)
    └── BDEFES_*/EFES.csv
```

---

## 6. ETL y datos epidemiológicos

### 6.1 Fuente de datos

**Sistema:** EFES (Estudio de Caso — Sistema de Vigilancia Epidemiológica)
**Archivo:** `EFES.csv` · Separador: `|` · Encoding: `latin-1` · ~730 filas · 531 columnas
**Confidencialidad:** No se versiona el CSV crudo. Solo se suben los tiles procesados.

### 6.2 Mapeo de columnas clave

| Letra col | Nombre | Uso |
|---|---|---|
| `h` (col 8) | `DES_MPO` | Municipio de residencia del paciente |
| `av` (col 48) | `FEC_PRI_CONSULT` | Fecha primera consulta (filtro año 2026) |
| `hk` (col 219) | `DES_RESULTADO3` | Resultado de laboratorio (filtro: POSITIVO) |
| col 518 | `CLAS_FINAL_SARAMPION` | Clasificación epi final (capa notificación) |
| col 25 | `IDE_SEX` | Sexo (1=M, 2=F) |
| col 22 | `IDE_EDA_ANO` | Edad en años |
| col 66 | `CTAS_DOS` | Número de dosis vacuna sarampión |
| col 77 | `ANT_VIAJE` | Antecedente de viaje (texto libre) |
| col 78 | `CONT_EFERM` | Contacto con enfermo (1=Sí) |
| col 80 | `CONTACTO_EMBARAZADAS` | Contacto con embarazadas (1=Sí) |

### 6.3 Situación epidemiológica actual (corte 18-Feb-2026)

**57 casos positivos por laboratorio en 4 municipios de Durango:**

| Municipio | Casos | Sin vacuna | Viaje a Sinaloa | Cont. embarazadas |
|---|---|---|---|---|
| Durango | 29 | 65.5% | Parcial (Durango ciudad) | 2 |
| Mezquital | 25 | **100%** | **100% (Villa Unión, Sin.)** | 19 |
| Gómez Palacio | 2 | 100% | No | 0 |
| Vicente Guerrero | 1 | 100% | No | 0 |

**Hallazgos epidemiológicos críticos:**
- Nexo de importación: **Villa Unión / Cristo Rey, Sinaloa** (jornaleros agrícolas)
- 47/57 casos (82%) sin ninguna dosis de vacuna
- Brote activo semanas 2–8 de 2026
- Mezquital: probable vínculo a comunidad indígena con baja cobertura histórica

---

## 7. Deployment

### 7.1 Cloudflare (producción pública)

```bash
npm run deploy:worker   # → Cloudflare Workers (tiles)
# Frontend: Cloudflare Pages (auto-deploy desde main)
```

**URLs:**
- Frontend: `https://main.pvu-webgis-2025.pages.dev`
- Tiles API: `https://pvu-tiles-worker.xtrctr.workers.dev`

### 7.2 Servidor institucional Ubuntu (self-hosted)

```bash
# 1. Clonar repo en servidor
ssh epidemiologia@10.6.35.42
git clone https://github.com/srmz04/VISOR-GIS-PVU.git /opt/pvu-tiles

# 2. Instalar y compilar
cd /opt/pvu-tiles && ./scripts/install.sh

# 3. Desplegar como servicio systemd
sudo ./scripts/deploy.sh
sudo systemctl status pvu-tiles
```

**Configuración del servicio:**
- Usuario: `tiles-service` (sin privilegios)
- Puerto: `3000` (Nginx reverse proxy → HTTPS)
- Tiles en: `/var/lib/pvu-tiles/durango.pmtiles`
- Límites: 512 MB RAM · 50% CPU · Restart automático

---

## 8. Deuda técnica

| Severidad | Descripción | Acción sugerida |
|---|---|---|
| Alta | `logger.ts` backend existe pero no está integrado | Reemplazar `console.log` en PMTilesService |
| Alta | ETL separado por capa (2 scripts) | Unificar en `process_efes.py` parametrizable |
| Media | `search_index.json` se genera manualmente | Agregar al pipeline de ETL |
| Media | GeoJSON rurales cargados en memoria completa | Migrar a Vector Tiles o fragmentar |
| Media | Sin tests automatizados del backend | Agregar tests de integración con Hono |
| Baja | Tailwind desde CDN en producción | Compilar Tailwind como PostCSS |
| Baja | CORS abierto (`*`) en Workers | Restringir a dominios institucionales |

---

## 9. Ramas y estado git

| Rama | Estado | Descripción |
|---|---|---|
| `main` | Estable | Versión deployada en Cloudflare |
| `feature/mapa-sarampion` | **Activa** | Capas epidemiológicas sarampión 2026 |

**Pendiente de merge a main:** Todo el trabajo de la rama `feature/mapa-sarampion`.

---

## 10. Criterios de aceptación para v2.0 estable

- [ ] Merge de `feature/mapa-sarampion` a `main` con PR revisado
- [ ] ETL unificado y documentado
- [ ] Logger backend integrado (sin `console.log` en código de producción)
- [ ] Panel de resumen estatal en sidebar
- [ ] Tests de humo en endpoints del backend
- [ ] Tailwind compilado (no CDN)
- [ ] CORS restringido a dominios institucionales
- [ ] Documentación de actualización de datos para usuarios no-técnicos
