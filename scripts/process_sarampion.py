
import pandas as pd
import geopandas as gpd
import os

# Configuración de rutas
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, 'VISOR-EPI/BDEFES_10_18-2-2026/EFES.csv')
SHP_PATH = os.path.join(BASE_DIR, '_geodata/Marco_Geoestadistico/Municipios.shp')
OUTPUT_PATH = os.path.join(BASE_DIR, 'web/data/sarampion_municipios.geojson')

def process_data():
    print("--- Iniciando procesamiento de datos Sarampión ---")
    
    # 1. Cargar CSV
    print(f"Cargando CSV: {CSV_PATH}")
    try:
        # Usamos 'latin-1' y separador '|' como se identificó en el análisis
        df = pd.read_csv(CSV_PATH, encoding='latin-1', sep='|', low_memory=False)
        print(f"Registros totales: {len(df)}")
    except Exception as e:
        print(f"Error al leer CSV: {e}")
        return

    # 2. Filtrar Confirmados
    print("Filtrando casos confirmados...")
    # Normalizar texto para asegurar coincidencia
    df['CLAS_FINAL_SARAMPION'] = df['CLAS_FINAL_SARAMPION'].astype(str).str.strip().str.upper()
    
    confirmados = df[df['CLAS_FINAL_SARAMPION'] == 'CONFIRMADO'].copy()
    print(f"Casos confirmados encontrados: {len(confirmados)}")
    
    if len(confirmados) == 0:
        print("No se encontraron casos confirmados. Abortando.")
        return

    # 3. Agrupar por Municipio
    # CVE_MPO_NOTIFICANTE parece ser el ID del municipio (numérico)
    # Necesitamos asegurar que coincida con el formato del shapefile (string con ceros a la izquierda probabablemente, o int)
    print("Agrupando por municipio...")
    
    # Conteo de casos por municipio
    casos_por_mpo = confirmados['CVE_MPO_NOTIFICANTE'].value_counts().reset_index()
    casos_por_mpo.columns = ['CVE_MUN', 'CASOS_CONFIRMADOS']
    
    # Convertir a entero para facilitar la union si el shp tiene enteros, o string si tiene strings
    casos_por_mpo['CVE_MUN'] = casos_por_mpo['CVE_MUN'].astype(int)
    
    print("Top 5 municipios con casos:")
    print(casos_por_mpo.head())

    # 4. Cargar Geometría
    print(f"Cargando Shapefile: {SHP_PATH}")
    try:
        gdf_mpo = gpd.read_file(SHP_PATH)
        print(f"Municipios en shapefile: {len(gdf_mpo)}")
        print("Columnas en shapefile:", gdf_mpo.columns.tolist())
    except Exception as e:
        print(f"Error al leer Shapefile: {e}")
        return

    # Intentar identificar la columna de clave de municipio en el SHP
    # Usualmente es CVE_MUN o similar. Vamos a imprimir sample data para verificar
    print("Ejemplo de datos del shapefile:")
    print(gdf_mpo.head(1).T)
    
    # Asumimos que existe una columna 'CVE_MUN' o similar.
    # Si el nombre es diferente, el script fallará aquí y ajustaremos.
    # En INEGI standard suele ser CVE_MUN o CVEGEO (que incluye estado)
    
    # Normalizamos clave municipio en el shapefile para el join
    # Buscamos la columna probable
    possible_id_cols = [col for col in gdf_mpo.columns if 'MUN' in col.upper() or 'CVE' in col.upper()]
    print(f"Posibles columnas de ID en SHP: {possible_id_cols}")
    
    # Ajuste manual basado en experiencia común, ajustaremos si falla
    target_shp_col = 'CVE_MUN' # Valor por defecto
    if 'CVE_MUN' not in gdf_mpo.columns:
        if 'CVE_MPO' in gdf_mpo.columns:
            target_shp_col = 'CVE_MPO'
        elif 'CVEGEO' in gdf_mpo.columns:
             # CVEGEO suele ser EDO+MUN (ej 10001). CVE_MPO_NOTIFICANTE es solo MUN (1)
             pass
    
    print(f"Usando columna '{target_shp_col}' del shapefile para unir.")
    
    # Asegurar tipos compatibles para el merge
    try: 
        gdf_mpo[target_shp_col] = gdf_mpo[target_shp_col].astype(int)
    except:
        print("No se pudo convertir columna SHP a int, intentando alinear tipos...")
    
    # 5. Unir Datos
    print("Uniendo datos...")
    # Left join para mantener solo los municipios del estado (asumiendo SHP es de Durango)
    # o hacemos inner join para solo tener poligonos con casos?
    # Para visualización de mapa, a veces es bueno mostrar todos los mpos en gris y los positivos en color.
    # Pero para optimizar PMTiles, quizás solo exportar los que tienen datos.
    
    # Vamos a filtrar el shapefile para incluir solo los que tienen casos para hacer el archivo más ligero
    gdf_final = gdf_mpo.merge(casos_por_mpo, left_on=target_shp_col, right_on='CVE_MUN', how='inner')
    
    print(f"Municipios con casos mappable: {len(gdf_final)}")
    
    # Guardar GeoJSON
    # Asegurar proyección LatLon (EPSG:4326) para la web
    if gdf_final.crs and gdf_final.crs.to_string() != 'EPSG:4326':
        print("Reproyectando a EPSG:4326...")
        gdf_final = gdf_final.to_crs("EPSG:4326")
        
    print(f"Guardando resultado en: {OUTPUT_PATH}")
    if not os.path.exists(os.path.dirname(OUTPUT_PATH)):
        os.makedirs(os.path.dirname(OUTPUT_PATH))
        
    gdf_final.to_file(OUTPUT_PATH, driver='GeoJSON')
    print("Proceso finalizado con éxito.")

if __name__ == '__main__':
    process_data()
