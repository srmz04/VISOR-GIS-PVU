import json
import os
import glob

# Configuración de rutas
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(BASE_DIR, 'web', 'data', 'search_index.json')
GEOJSON_DIR = os.path.join(BASE_DIR, 'data', 'geojson')

def get_centroid(feature):
    """Calcula un centroide aproximado (promedio de coordenadas) para volar ahí."""
    try:
        geometry = feature.get('geometry', {})
        coords = geometry.get('coordinates', [])
        
        if geometry.get('type') == 'Polygon':
            # Polygon: [ [ [x, y], ... ] ] -> Tomamos el primer anillo
            ring = coords[0]
        elif geometry.get('type') == 'MultiPolygon':
            # MultiPolygon: [ [ [ [x, y], ... ] ] ] -> Tomamos el primer anillo del primer polígono
            ring = coords[0][0]
        else:
            return None

        # Calcular promedio
        sum_lon = 0
        sum_lat = 0
        count = 0
        for pt in ring:
            sum_lon += pt[0]
            sum_lat += pt[1]
            count += 1
        
        if count == 0: return None
        return [sum_lon / count, sum_lat / count]
    except Exception:
        return None

def normalize_institution(props):
    # Intentar obtener de varias propiedades posibles
    inst = props.get('INSTITUCION') or props.get('INSTITUCI') or ""
    inst = str(inst).upper().strip()
    
    # Normalización estándar del proyecto
    if 'IMSS' in inst and 'BIENESTAR' in inst: return 'IMSS_BIENESTAR'
    if 'IMSS' in inst and 'ORDINARIO' in inst: return 'IMSS_ORDINARIO'
    if 'ISSSTE' in inst: return 'ISSSTE'
    if 'SSD' in inst or 'JURISDICCI' in inst: return 'SSD'
    return inst or 'DESCONOCIDO'

def build_index():
    print(f"Loading existing index from: {JSON_PATH}")
    
    current_index = []
    if os.path.exists(JSON_PATH):
        try:
            with open(JSON_PATH, 'r', encoding='utf-8') as f:
                current_index = json.load(f)
        except Exception as e:
            print(f"Error loading existing index: {e}")

    # Filtrar solo rurales para regenerar urbanos limpiamente
    rural_data = [item for item in current_index if item.get('t') != 'urbano']
    print(f"Retained {len(rural_data)} rural records.")

    urban_records = []
    
    # Buscar archivos GeoJSON urbanos
    pattern = os.path.join(GEOJSON_DIR, 'URB_*.geojson')
    files = glob.glob(pattern)
    print(f"Found {len(files)} Urban GeoJSON files: {files}")

    for file_path in files:
        print(f"Processing {os.path.basename(file_path)}...")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            features = data.get('features', [])
            for feature in features:
                props = feature.get('properties', {})
                
                cve_ageb = str(props.get('CVE_AGEB', '')).strip()
                if not cve_ageb: continue
                
                nom_mun = props.get('NOM_MUN', 'Desconocido').title()
                
                # Calcular centroide
                center = get_centroid(feature)
                if not center: continue

                # Crear registro
                record = {
                    "n": f"AGEB {cve_ageb}",
                    "m": nom_mun,
                    "i": normalize_institution(props),
                    "c": center,
                    "t": "urbano",
                    # Metadata extra para depuración o UI futura
                    "meta": { "cve": cve_ageb } 
                }
                urban_records.append(record)

        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    print(f"Processed {len(urban_records)} urban records from GeoJSONs.")

    # Fusionar y Guardar
    final_index = rural_data + urban_records
    
    # Ordenar por nombre para búsqueda binaria (opcional pero bueno)
    final_index.sort(key=lambda x: x['n'])

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(final_index, f, ensure_ascii=False)
    
    print(f"Successfully saved merged index with {len(final_index)} items to {JSON_PATH}")

if __name__ == "__main__":
    build_index()
