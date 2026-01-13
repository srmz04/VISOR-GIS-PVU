# PVU WebGIS - Visor Geoespacial de Vacunación

Sistema WebGIS para visualización y análisis de responsabilidades de vacunación en el estado de Durango, México. Permite explorar la distribución geográfica de responsabilidades institucionales (IMSS, ISSSTE, SSA) tanto en zonas urbanas (AGEBs) como rurales (localidades).

![MapLibre](https://img.shields.io/badge/MapLibre-GL-blue)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-orange)
![License](https://img.shields.io/badge/License-Apache%202.0-blue)

---

## Demo

**Versión en línea:** [https://pvu-webgis-2025.pages.dev](https://pvu-webgis-2025.pages.dev)

---

## Características

- Visualización de AGEBs urbanas con responsabilidad institucional
- Mapeo de localidades rurales con clustering dinámico
- Búsqueda por nombre de localidad o clave de AGEB
- Activación automática de capas al seleccionar resultados
- Interfaz responsive (móvil y escritorio)
- Datos servidos mediante Vector Tiles (PMTiles)

---

## Tecnologías

| Componente | Tecnología                 |
| ---------- | --------------------------- |
| Frontend   | MapLibre GL JS, Vanilla JS  |
| Tiles      | PMTiles, Cloudflare Workers |
| Datos      | GeoJSON, Shapefiles (INEGI) |
| Hosting    | Cloudflare Pages            |
| Desarrollo | Python, QGIS                |

---

## Instalación Local

```bash
# Clonar repositorio
git clone https://github.com/srmz04/VISOR-GIS-PVU.git
cd VISOR-GIS-PVU

# Iniciar servidor local
cd web
python3 -m http.server 3000

# Abrir en navegador
# http://localhost:3000
```

---

## Estructura del Proyecto

```
pvu-webgis/
├── web/                    # Aplicación frontend
│   ├── index.html         # Página principal
│   ├── app.js             # Lógica del visor
│   ├── config.js          # Configuración de capas
│   ├── styles.css         # Estilos
│   └── data/              # Datos para el visor
├── workers/               # Cloudflare Workers (tiles)
├── tools/                 # Scripts de procesamiento
├── data/                  # Datos procesados
├── Dockerfile            # Imagen Docker
└── docker-compose.yml    # Orquestación
```

---

## Sobre Este Proyecto

Este sistema fue desarrollado de manera personal, en tiempo libre, como ejercicio práctico para aplicar conocimientos adquiridos en cursos de desarrollo web, GIS y visualización de datos.

El proyecto se comparte públicamente con la esperanza de que pueda ser útil a otras personas u organizaciones con necesidades similares de visualización geoespacial en el sector salud.

### Filosofía

- **Open Source:** El código es libre y abierto bajo licencia MIT
- **Atribución:** Si utilizas este proyecto, se agradece mención al autor
- **Comunidad:** Las contribuciones y mejoras son bienvenidas
- **Transparencia:** El desarrollo es público y documentado

### Si usas este proyecto...

Me encantaría saber cómo lo estás utilizando. No es obligatorio, pero si este proyecto te resulta útil, considera:

1. Dar una estrella al repositorio
2. Enviarme un breve mensaje a s.ramirez.s@gmail.com
3. Mencionar la fuente en tu documentación

Esto me ayuda a entender el impacto del proyecto y motivarme a seguir mejorándolo.

---

## Contribuciones

Las contribuciones son bienvenidas. Por favor lee [CONTRIBUTING.md](CONTRIBUTING.md) para conocer el proceso.

---

## Licencia

Este proyecto está bajo la Licencia Apache 2.0. Ver [LICENSE](LICENSE) para más detalles.

---

## Autor

**Dr. Silvano Ramírez Soto**

- Email: s.ramirez.s@gmail.com
- GitHub: [@srmz04](https://github.com/srmz04)

---

## Agradecimientos

- Datos geográficos: INEGI (Marco Geoestadístico Nacional)
- Inspiración: La necesidad de herramientas accesibles para el sector salud público
