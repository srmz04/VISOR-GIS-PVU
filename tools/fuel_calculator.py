#!/usr/bin/env python3
"""
Calculadora de Costos de Combustible
=====================================
Calcula el costo de gasolina para una ruta usando la API SAKBÉ de INEGI
y los datos de localidades del proyecto VISOR-GIS-PVU.

Uso:
    python tools/fuel_calculator.py

Ejemplo de consulta:
    Silverado 2018 | Durango → Huazamotita (ida y vuelta)
"""

import json
import os
import sys
import math
import urllib.request
import urllib.parse
import urllib.error

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN API SAKBÉ (INEGI)
# ─────────────────────────────────────────────────────────────────────────────
SAKBE_TOKEN = "hFLK9fS7-97UL-QiQW-sXCL-I1aV5oYN6lbB"
SAKBE_BASE  = "https://gaia.inegi.org.mx/sakbe_v3.1"

# ─────────────────────────────────────────────────────────────────────────────
# LOCALIDADES (coordenadas WGS84)
# ─────────────────────────────────────────────────────────────────────────────

# Durango city — centroide del área urbana (no está en los GeoJSON rurales)
DURANGO_CIUDAD = {
    "nombre":    "Victoria de Durango (Ciudad)",
    "municipio": "Durango",
    "lon":       -104.6532,
    "lat":        24.0277,
}

# Huazamotita — coordenadas exactas del GeoJSON del proyecto
#   CVE_GEO: 100140408 | Municipio: Mezquital | POBTOT: 223
HUAZAMOTITA = {
    "nombre":    "Huazamotita",
    "municipio": "Mezquital",
    "lon":       -104.62636777831,
    "lat":        22.69446222174849,
    "cvegeo":    "100140408",
}

# Huazamota — localidad mayor cercana (por referencia)
#   CVE_GEO: 100140016 | Municipio: Mezquital | POBTOT: 1253
HUAZAMOTA = {
    "nombre":    "Huazamota",
    "municipio": "Mezquital",
    "lon":       -104.4931274995204,
    "lat":        22.524651943518283,
    "cvegeo":    "100140016",
}

# ─────────────────────────────────────────────────────────────────────────────
# ESPECIFICACIONES VEHÍCULO: Silverado 2018
# ─────────────────────────────────────────────────────────────────────────────
# Fuente: EPA / FUELECONOMY.GOV para Chevrolet Silverado 1500 2018
#   Motor 5.3L V8 EcoTec3 (el más común en México), 2WD
#   Ciudad:     17 MPG  → 13.8 L/100km
#   Carretera:  23 MPG  → 10.2 L/100km
#   Combinado:  20 MPG  → 11.8 L/100km
#
#   Para rutas de montaña en la Sierra Madre Occidental (cambios de pendiente
#   pronunciados, curvas cerradas): se aplica factor de corrección +25%
#   → consumo estimado serrano: ~14.5 L/100km

SILVERADO_2018 = {
    "nombre":               "Chevrolet Silverado 1500 2018",
    "motor":                "5.3L V8 EcoTec3 (GasEV)",
    "traccion":             "2WD / 4WD",
    "consumo_ciudad":       13.8,   # L/100km (17 MPG)
    "consumo_carretera":    10.2,   # L/100km (23 MPG)
    "consumo_combinado":    11.8,   # L/100km (20 MPG)
    "consumo_montaña":      14.5,   # L/100km  (estimación Sierra Madre Occ.)
    "combustible":          "Gasolina Magna",
    "tanque_litros":        98,     # litros (tanque estándar)
}

# Precio de combustible (promedio Durango, 2026)
PRECIO_MAGNA_MXN   = 23.50   # $/litro  (Magna)
PRECIO_PREMIUM_MXN = 25.20   # $/litro  (Premium)
PRECIO_USD_EXCHANGE = 17.20  # MXN por USD (referencia)

# ─────────────────────────────────────────────────────────────────────────────
# FUNCIONES DE CÁLCULO
# ─────────────────────────────────────────────────────────────────────────────

def haversine_km(lon1, lat1, lon2, lat2):
    """Distancia en línea recta (km) entre dos puntos WGS84."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def call_sakbe_ruta(origen_lon, origen_lat, destino_lon, destino_lat, tipo=0):
    """
    Llama a la API SAKBÉ v3.1 para obtener la ruta entre dos puntos.

    tipo:
        0 = ruta más rápida (tiempo)
        1 = ruta más corta (distancia)

    Retorna: dict con 'distancia_m', 'tiempo_min', 'geometria' (GeoJSON)
    """
    params = urllib.parse.urlencode({
        "token":   SAKBE_TOKEN,
        "origen":  f"{origen_lon},{origen_lat}",
        "destino": f"{destino_lon},{destino_lat}",
        "tipo":    tipo,
    })
    url = f"{SAKBE_BASE}/ruta?{params}"

    print(f"  → GET {url[:90]}...")

    req = urllib.request.Request(url, headers={"User-Agent": "VISOR-GIS-PVU/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            return _parse_sakbe_response(data, origen_lon, origen_lat,
                                         destino_lon, destino_lat)
    except urllib.error.HTTPError as e:
        print(f"  ✗ HTTP Error {e.code}: {e.reason}")
        return None
    except urllib.error.URLError as e:
        print(f"  ✗ URL Error: {e.reason}")
        return None
    except Exception as e:
        print(f"  ✗ Error inesperado: {e}")
        return None


def _parse_sakbe_response(data, orig_lon, orig_lat, dest_lon, dest_lat):
    """
    Normaliza la respuesta de SAKBÉ (el formato puede variar ligeramente
    entre versiones). Retorna dict estandarizado.
    """
    resultado = {
        "distancia_m":  None,
        "distancia_km": None,
        "tiempo_min":   None,
        "tiempo_horas": None,
        "geometria":    None,
        "raw":          data,
    }

    # Distancia
    for key in ("distancia", "distancia_m", "length", "distance"):
        if key in data:
            val = data[key]
            # SAKBÉ puede dar metros o km
            if isinstance(val, (int, float)):
                if val > 1000:          # probablemente metros
                    resultado["distancia_m"]  = float(val)
                    resultado["distancia_km"] = float(val) / 1000.0
                else:                   # probablemente km
                    resultado["distancia_km"] = float(val)
                    resultado["distancia_m"]  = float(val) * 1000.0
                break

    # Tiempo
    for key in ("tiempo", "tiempo_min", "duration", "time"):
        if key in data:
            val = data[key]
            if isinstance(val, (int, float)):
                resultado["tiempo_min"]   = float(val)
                resultado["tiempo_horas"] = float(val) / 60.0
                break

    # Geometría (ruta)
    for key in ("features", "geometry", "geojson", "route"):
        if key in data:
            resultado["geometria"] = data[key]
            break

    return resultado


def calcular_combustible(distancia_km, consumo_l100km, precio_litro):
    """Retorna litros consumidos y costo total."""
    litros = (distancia_km * consumo_l100km) / 100.0
    costo  = litros * precio_litro
    return litros, costo


def linea(char="─", ancho=70):
    print(char * ancho)


def imprimir_resultados(origen, destino, ruta_ida, escenarios):
    """Imprime el reporte de costos de combustible."""
    dist_ida_km = ruta_ida["distancia_km"]
    tiempo_ida  = ruta_ida.get("tiempo_min")

    dist_rt_km  = dist_ida_km * 2           # ida y vuelta
    tiempo_rt   = (tiempo_ida * 2) if tiempo_ida else None

    linea("═")
    print(f"  CALCULADORA DE COMBUSTIBLE — SAKBÉ INEGI v3.1")
    linea("═")
    print(f"  Vehículo : {SILVERADO_2018['nombre']}")
    print(f"  Motor    : {SILVERADO_2018['motor']}")
    print()
    print(f"  Origen   : {origen['nombre']} ({origen['lat']:.4f}°N, {origen['lon']:.4f}°O)")
    print(f"  Destino  : {destino['nombre']} ({destino['lat']:.4f}°N, {destino['lon']:.4f}°O)")
    linea()
    print(f"  Distancia ida          : {dist_ida_km:>8.2f} km")
    print(f"  Distancia ida y vuelta : {dist_rt_km:>8.2f} km")
    if tiempo_rt:
        hh = int(tiempo_rt // 60)
        mm = int(tiempo_rt % 60)
        print(f"  Tiempo estimado (RT)   : {hh:>5}h {mm:02d}min  (sin paradas)")
    linea()
    print(f"  {'ESCENARIO':<28}  {'L/100km':>7}  {'Litros':>7}  {'Costo MXN':>10}")
    linea()

    for esc in escenarios:
        litros_rt, costo_rt = calcular_combustible(
            dist_rt_km, esc["consumo"], esc["precio"]
        )
        costo_usd = costo_rt / PRECIO_USD_EXCHANGE
        print(f"  {esc['label']:<28}  {esc['consumo']:>6.1f}L  {litros_rt:>6.1f}L  "
              f"${costo_rt:>9,.2f}  (≈ USD {costo_usd:.2f})")

    linea()
    dist_h = haversine_km(origen["lon"], origen["lat"],
                          destino["lon"], destino["lat"])
    print(f"  Distancia en línea recta (ref.) : {dist_h:.1f} km")
    print(f"  Factor carretera / línea recta  : {dist_ida_km / dist_h:.2f}x")
    linea("═")
    print()
    print("  NOTA: Precio Magna referencia ≈ $23.50 MXN/L (Durango, mar 2026)")
    print("  Los tiempos no incluyen paradas, topes de velocidad ni clima.")
    linea("═")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    # ── Destino por defecto: Huazamotita (como indicó el usuario) ──────────
    destino = HUAZAMOTITA
    # Descomenta la siguiente línea para calcular a Huazamota en su lugar:
    # destino = HUAZAMOTA

    print()
    print("  Consultando API SAKBÉ de INEGI...")
    print(f"  Ruta: {DURANGO_CIUDAD['nombre']} → {destino['nombre']}")
    print()

    ruta = call_sakbe_ruta(
        DURANGO_CIUDAD["lon"], DURANGO_CIUDAD["lat"],
        destino["lon"],        destino["lat"],
        tipo=0  # ruta más rápida
    )

    if ruta is None or ruta.get("distancia_km") is None:
        print("  ⚠  No se pudo obtener la ruta por la API. Usando estimación.")
        print("  Respuesta raw:", ruta.get("raw") if ruta else "—")
        print()
        # Fallback: estimación basada en factor conocido de esta ruta serrana.
        # Ruta Durango → Mezquital / Huazamotita:
        #   - Durango → Nombre de Dios: ~45 km (carretera plana)
        #   - Nombre de Dios → zona Mezquital: ~100 km (carretera serrana)
        #   - Hacia Huazamotita (barranca): ~60 km (brecha/camino de terracería)
        #   Total estimado: ~200-215 km  → factor ~1.42 sobre línea recta
        dist_linea = haversine_km(
            DURANGO_CIUDAD["lon"], DURANGO_CIUDAD["lat"],
            destino["lon"], destino["lat"]
        )
        dist_estimada_km = round(dist_linea * 1.42, 1)
        tiempo_estimado  = dist_estimada_km / 38.0 * 60  # ~38 km/h promedio serrano
        ruta = {
            "distancia_km": dist_estimada_km,
            "distancia_m":  dist_estimada_km * 1000,
            "tiempo_min":   tiempo_estimado,
            "tiempo_horas": tiempo_estimado / 60,
            "estimacion":   True,
        }
        print(f"  Distancia línea recta  : {dist_linea:.1f} km")
        print(f"  Distancia estimada ruta: {dist_estimada_km:.1f} km  (factor 1.42x)")
        print()

    # Escenarios de consumo
    escenarios = [
        {
            "label":   "Carretera federal (optimista)",
            "consumo": SILVERADO_2018["consumo_carretera"],
            "precio":  PRECIO_MAGNA_MXN,
        },
        {
            "label":   "Combinado (EPA)",
            "consumo": SILVERADO_2018["consumo_combinado"],
            "precio":  PRECIO_MAGNA_MXN,
        },
        {
            "label":   "Sierra Madre (realista)",
            "consumo": SILVERADO_2018["consumo_montaña"],
            "precio":  PRECIO_MAGNA_MXN,
        },
        {
            "label":   "Sierra + Premium",
            "consumo": SILVERADO_2018["consumo_montaña"],
            "precio":  PRECIO_PREMIUM_MXN,
        },
    ]

    imprimir_resultados(DURANGO_CIUDAD, destino, ruta, escenarios)

    # Guardar resultado como JSON en el directorio tools/
    output_path = os.path.join(os.path.dirname(__file__), "fuel_result.json")
    result_data = {
        "origen":    DURANGO_CIUDAD,
        "destino":   destino,
        "vehiculo":  SILVERADO_2018,
        "ruta":      {k: v for k, v in ruta.items() if k != "raw"},
        "escenarios": [
            {
                **e,
                "litros_rt": round(
                    calcular_combustible(ruta["distancia_km"]*2,
                                        e["consumo"], e["precio"])[0], 2),
                "costo_rt_mxn": round(
                    calcular_combustible(ruta["distancia_km"]*2,
                                        e["consumo"], e["precio"])[1], 2),
            }
            for e in escenarios
        ],
        "precios_combustible": {
            "magna_mxn":   PRECIO_MAGNA_MXN,
            "premium_mxn": PRECIO_PREMIUM_MXN,
        },
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=2)
    print(f"  Resultados guardados en: {output_path}")
    print()


if __name__ == "__main__":
    main()
