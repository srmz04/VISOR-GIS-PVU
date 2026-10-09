
import json
import os
import glob

# Configuración
INPUT_DIR = 'data/geojson'
OUTPUT_DIR = 'web/data'
NEEDED_PROPS = [
    'NOMLOC', 'NOM_LOC', 'NOM_MUN', 'POBTOT', 'POBFEM', 'POBMAS', 
    'JURISDICCION_NUM', 'CVE_MUN', 'CVEGEO9', 'INSTITUCION', 
    'TIPO', 'CLUES', 'HORARIO', 'DIAS_LABORALES'
]

# Mapeo de archivos de entrada a nombres de salida simplificados
FILES = {
    'RUR_SSD_JURISDICCION.geojson': 'rural_ssd.geojson',
    'RUR_IMSS_BIENESTAR.geojson': 'rural_imss_bienestar.geojson',
    'RUR_ISSSTE.geojson': 'rural_issste.geojson',
    'RUR_SIN_COBERTURA.geojson': 'rural_sin_cobertura.geojson'
}

def optimize_file(filename, output_name):
    input_path = os.path.join(INPUT_DIR, filename)
    output_path = os.path.join(OUTPUT_DIR, output_name)
    
    if not os.path.exists(input_path):
        print(f"Skipping {filename}: Not found")
        return

    print(f"Processing {filename}...")
    
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    valid_features = []
    
    for f in data['features']:
        # Solo puntos
        if f['geometry']['type'] != 'Point':
            continue
            
        props = f['properties']
        new_props = {}
        
        # Copiar solo propiedades necesarias
        for k in NEEDED_PROPS:
            # Intentar match exacto o variantes comunes
            val = props.get(k)
            if val is None and k == 'NOM_LOC': val = props.get('NOMLOC')
            if val is None and k == 'NOMLOC': val = props.get('NOM_LOC')
            
            if val is not None:
                new_props[k] = val
        
        # Normalizar Institución si falta
        if 'INSTITUCION' not in new_props:
            if 'IMSS_BIENESTAR' in filename: new_props['INSTITUCION'] = 'IMSS BIENESTAR'
            elif 'ISSSTE' in filename: new_props['INSTITUCION'] = 'ISSSTE'
            elif 'SSD' in filename: new_props['INSTITUCION'] = 'SSD'
            elif 'SIN_COBERTURA' in filename: new_props['INSTITUCION'] = 'SIN COBERTURA'

        f['properties'] = new_props
        valid_features.append(f)

    data['features'] = valid_features
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)
        
    orig_size = os.path.getsize(input_path) / 1024
    new_size = os.path.getsize(output_path) / 1024
    print(f"  -> Saved to {output_path}")
    print(f"  -> Reduction: {orig_size:.1f}KB -> {new_size:.1f}KB ({100 - (new_size/orig_size*100):.1f}%)")

if __name__ == '__main__':
    for input_f, output_f in FILES.items():
        optimize_file(input_f, output_f)
