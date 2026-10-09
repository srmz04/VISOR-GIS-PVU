# VISOR GIS/PVU

Sistema WebGIS para visualización y análisis de responsabilidades de vacunación en el estado de Durango, México. Esta versión ha sido migrada a una arquitectura agnóstica de nube usando el framework **Hono**.

![Hono](https://img.shields.io/badge/Hono-Framework-e36002)
![MapLibre](https://img.shields.io/badge/MapLibre-GL-blue)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange)
![License](https://img.shields.io/badge/License-Apache%202.0-blue)

---

## Demo

**Versión en línea:** [https://main.pvu-webgis-2025.pages.dev](https://main.pvu-webgis-2025.pages.dev)

**Tile Server (Health Check):** [https://pvu-tiles-worker.xtrctr.workers.dev/health](https://pvu-tiles-worker.xtrctr.workers.dev/health)

---

## Características Principales

- **Arquitectura portable:** El patrón de adaptadores permite ejecutar el servidor de tiles sobre Cloudflare R2 o un sistema de archivos local.
- **Visualización geoespacial:** AGEB urbanas y localidades rurales con MapLibre GL JS y PMTiles.
- **Cero Costo:** Optimizado para el free tier de Cloudflare (Pages + Workers + R2).
- **Búsqueda local:** Índice compacto para localizar comunidades sin consultar una base remota.

---

## Estructura del Proyecto

```
VISOR-GIS-PVU/
├── src/                    # Código fuente (TypeScript)
│   ├── adapters/          # Adaptadores de almacenamiento (R2, FS)
│   ├── core/              # Lógica de negocio y servicios PMTiles
│   ├── app.ts             # Aplicación Hono (universal)
│   ├── worker.ts          # Entry point para Cloudflare Workers
│   └── server.ts          # Entry point para Node.js (Ubuntu/Local)
├── web/                    # Aplicación frontend (MapLibre JS)
├── data/                   # Datos procesados (PMTiles, JSON)
└── project_definition.json # Especificación técnica del proyecto
```

---

## Tecnologías

| Componente               | Tecnología                               |
| :----------------------- | :---------------------------------------- |
| **Backend**        | Hono Framework (TypeScript)               |
| **Frontend**       | MapLibre GL JS, Vanilla JS                |
| **Tiles**          | PMTiles (Vector Tiles)                    |
| **Almacenamiento** | Cloudflare R2 / Sistema de Archivos local |
| **Hosting**        | Cloudflare Pages (Frontend)               |

---

## Instalación y Desarrollo

### Requisitos

- Node.js 22+
- npm o bun

### Comandos principales

```bash
# Instalar dependencias
npm ci

# Servidor de tiles local (Node.js)
npm run start

# Desarrollo Workers (Wrangler)
npm run dev:worker

# Despliegue Workers
npm run deploy:worker
```

---

## Datos y privacidad

El visor publica capas territoriales y catálogos geográficos. No contiene padrones nominales, expedientes clínicos ni ubicaciones individuales de vacunación.

---

## Licencia

Este proyecto está bajo la Licencia Apache 2.0. Ver [LICENSE](LICENSE) para más detalles.

---

## Autor

**Silvano Ramírez Soto**

- GitHub: [@srmz04](https://github.com/srmz04)
