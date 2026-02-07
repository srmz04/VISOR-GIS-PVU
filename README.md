# VISOR GIS/PVU - Versión Hono

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

- **Arquitectura Agnóstica:** Gracias a un patrón de Adaptadores, el servidor de tiles puede ejecutarse en Cloudflare Workers, Node.js, Bun o Deno.
- **Visualización Avanzada:** Agebs urbanas y localidades rurales con MapLibre GL JS y PMTiles.
- **Cero Costo:** Optimizado para el free tier de Cloudflare (Pages + Workers + R2).
- **Código Limpio:** Refactorización profunda para eliminar rastros de IA, humanizar comentarios y estandarizar la lógica en español técnico.

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
├── _archive/               # Archivo de infraestructura y scripts legados
├── data/                   # Datos procesados (PMTiles, JSON)
└── project_definition.json # Especificación técnica del proyecto
```

---

## Tecnologías

| Componente | Tecnología |
| :--- | :--- |
| **Backend** | Hono Framework (TypeScript) |
| **Frontend** | MapLibre GL JS, Vanilla JS |
| **Tiles** | PMTiles (Vector Tiles) |
| **Almacenamiento**| Cloudflare R2 / Sistema de Archivos local |
| **Hosting** | Cloudflare Pages (Frontend) |

---

## Instalación y Desarrollo

### Requisitos
- Node.js 18+
- npm o bun

### Comandos principales

```bash
# Instalar dependencias
npm install

# Servidor de tiles local (Node.js)
npm run start

# Desarrollo Workers (Wrangler)
npm run dev:worker

# Despliegue Workers
npm run deploy:worker
```

---

## Sobre la Migración y Limpieza

Esta versión marca un hito en la madurez del proyecto:
1.  **Limpieza:** Se han depurado comentarios generados automáticamente y scripts redundantes, moviéndolos a un archivo histórico.
2.  **Hono:** Se seleccionó Hono por ser ligero y compatible con múltiples runtimes, eliminando el "lock-in" directo con la API de Cloudflare.
3.  **Humanización:** Toda la documentación y comentarios han sido revisados para reflejar una comunicación técnica directa y profesional en español.

---

## Licencia

Este proyecto está bajo la Licencia Apache 2.0. Ver [LICENSE](LICENSE) para más detalles.

---

## Autor

**Dr. Silvano Ramírez Soto**
- Email: s.ramirez.s@gmail.com
- GitHub: [@srmz04](https://github.com/srmz04)
