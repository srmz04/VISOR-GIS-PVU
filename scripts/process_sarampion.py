
import pandas as pd
import geopandas as gpd
import os
import json

# ─── Rutas ───────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH   = os.path.join(BASE_DIR, 'VISOR-EPI/BDEFES_10_18-2-2026/EFES.csv')
SHP_PATH   = os.path.join(BASE_DIR, '_geodata/Marco_Geoestadistico/Municipios.shp')
OUTPUT_GEO = os.path.join(BASE_DIR, 'web/data/sarampion_municipios.geojson')
META_PATH  = os.path.join(BASE_DIR, 'web/data/epidemio_meta.json')


def process_data():
    print("--- Sarampión ETL ---")

    # 1. Leer CSV
    try:
        df = pd.read_csv(CSV_PATH, encoding='latin-1', sep='|', low_memory=False)
        print(f"Registros totales: {len(df)}")
    except Exception as e:
        print(f"Error al leer CSV: {e}")
        return

    # 2. Filtrar confirmados
    df['CLAS_FINAL_SARAMPION'] = df['CLAS_FINAL_SARAMPION'].astype(str).str.strip().str.upper()
    confirmados = df[df['CLAS_FINAL_SARAMPION'] == 'CONFIRMADO'].copy()
    print(f"Casos confirmados: {len(confirmados)}")
    if len(confirmados) == 0:
        print("Sin confirmados. Abortando.")
        return

    # 3. Conteo por municipio notificante
    conteo = confirmados['CVE_MPO_NOTIFICANTE'].value_counts().reset_index()
    conteo.columns = ['CVE_MUN_KEY', 'CASOS_CONFIRMADOS']
    conteo['CVE_MUN_KEY'] = conteo['CVE_MUN_KEY'].astype(int)

    # 4. Nombre del municipio notificante (usar DES_MPO_NOTIFICANTE del CSV)
    nom_mpo = (
        confirmados[['CVE_MPO_NOTIFICANTE', 'DES_MPO_NOTIFICANTE']]
        .drop_duplicates(subset='CVE_MPO_NOTIFICANTE')
        .rename(columns={
            'CVE_MPO_NOTIFICANTE': 'CVE_MUN_KEY',
            'DES_MPO_NOTIFICANTE': 'NOM_MUN'
        })
    )
    nom_mpo['CVE_MUN_KEY'] = nom_mpo['CVE_MUN_KEY'].astype(int)
    conteo = conteo.merge(nom_mpo, on='CVE_MUN_KEY', how='left')
    print("Top 5:", conteo.head().to_string())

    # 5. Cargar shapefile
    try:
        gdf = gpd.read_file(SHP_PATH)
        print(f"Municipios en SHP: {len(gdf)}")
    except Exception as e:
        print(f"Error al leer SHP: {e}")
        return

    # Convertir CVE_MUN a entero para el join
    gdf['CVE_MUN_INT'] = gdf['CVE_MUN'].astype(str).str.lstrip('0')
    gdf['CVE_MUN_INT'] = gdf['CVE_MUN_INT'].replace('', '0').astype(int)

    # 6. Join (inner: solo municipios con casos)
    gdf_final = gdf.merge(conteo, left_on='CVE_MUN_INT', right_on='CVE_MUN_KEY', how='inner')
    print(f"Municipios con casos: {len(gdf_final)}")

    # Usar NOM_MUN del shapefile como fallback si el del CSV viene raro
    # El campo NOM_MUN del SHP es confiable para Durango
    # El del CSV puede traer nombres de otros estados (ej. JIMENEZ CHIHUAHUA)
    # Dejamos el del CSV para que sea exacto al catálogo de notificación

    # 7. Reproyectar a WGS84
    if gdf_final.crs and gdf_final.crs.to_epsg() != 4326:
        print("Reproyectando a EPSG:4326...")
        gdf_final = gdf_final.to_crs("EPSG:4326")

    # 8. Guardar GeoJSON
    os.makedirs(os.path.dirname(OUTPUT_GEO), exist_ok=True)

    # Tras el merge puede aparecer NOM_MUN_x (SHP) y NOM_MUN_y (CSV)
    # Queremos usar el del CSV como nombre de notificación, pero si no existe,
    # usamos el del SHP (que es el confiable para municipios de Durango).
    if 'NOM_MUN_y' in gdf_final.columns:
        # NOM_MUN_y => nombre del CSV (municipio notificante, puede ser de otro estado)
        # NOM_MUN_x => nombre del SHP (siempre de Durango)
        gdf_final = gdf_final.rename(columns={'NOM_MUN_y': 'NOM_MUN', 'NOM_MUN_x': 'NOM_MUN_SHP'})
    elif 'NOM_MUN_x' in gdf_final.columns:
        gdf_final = gdf_final.rename(columns={'NOM_MUN_x': 'NOM_MUN'})

    cols_exportar = ['geometry', 'CVE_MUN', 'NOM_MUN', 'CASOS_CONFIRMADOS']
    gdf_final[cols_exportar].to_file(OUTPUT_GEO, driver='GeoJSON')
    print(f"GeoJSON guardado: {OUTPUT_GEO}")

    # 9. Calcular bounds y exportar epidemio_meta.json
    # Esto permite que config.js/app.js conozcan el extent exacto del dataset
    # sin tener que consultar los tiles en tiempo real
    bounds_total = gdf_final.geometry.total_bounds  # [minx, miny, maxx, maxy]
    bounds_list  = [
        round(float(bounds_total[0]), 6),  # minLng
        round(float(bounds_total[1]), 6),  # minLat
        round(float(bounds_total[2]), 6),  # maxLng
        round(float(bounds_total[3]), 6),  # maxLat
    ]

    meta = {
        "sarampion_notificacion": {
            "bounds":   bounds_list,
            "total":    int(conteo['CASOS_CONFIRMADOS'].sum()),
            "municipios": int(len(gdf_final)),
            "fuente":   "EFES — clasificación CONFIRMADO",
            "generado": pd.Timestamp.now().isoformat()
        }
    }
    with open(META_PATH, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Meta exportada: {META_PATH}")
    print(f"Bounds -> {bounds_list}")
    print("ETL completado.")


if __name__ == '__main__':
    process_data()
