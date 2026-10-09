
import json
import os

input_file = 'data/geojson/RUR_SSD_JURISDICCION.geojson'
output_file = 'data/geojson/RUR_SSD_OPTIMIZED.geojson'

needed_props = ['NOMLOC', 'NOM_MUN', 'POBTOT', 'POBFEM', 'POBMAS', 'JURISDICCION_NUM', 'CVE_MUN', 'CVEGEO9', 'INSTITUCION']

with open(input_file, 'r') as f:
    data = json.load(f)

print(f"Original features: {len(data['features'])}")

for f in data['features']:
    props = f['properties']
    new_props = {}
    for k in needed_props:
        if k in props:
            new_props[k] = props[k]
    # Add minimal context if missing
    if 'INSTITUCION' not in new_props:
        new_props['INSTITUCION'] = 'SSD' 
    f['properties'] = new_props

with open(output_file, 'w') as f:
    json.dump(data, f, separators=(',', ':'))

orig_size = os.path.getsize(input_file) / (1024*1024)
new_size = os.path.getsize(output_file) / (1024*1024)

print(f"Original Size: {orig_size:.2f} MB")
print(f"Optimized Size: {new_size:.2f} MB")
