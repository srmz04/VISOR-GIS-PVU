#!/bin/bash
# Script de despliegue para servidor Ubuntu
set -e

echo "=== Despliegue VISOR-GIS-PVU Tile Server ==="

# Verificar que estamos ejecutando el script con privilegios
if [ "$EUID" -ne 0 ]; then 
   echo "⚠️  Se requieren privilegios sudo. Ejecuta: sudo ./deploy.sh"
   exit 1
fi

# 1. Crear usuario de sistema si no existe
echo "👤 Configurando usuario de sistema..."
if ! id "tiles-service" &>/dev/null; then
    useradd -r -s /bin/false tiles-service
    echo "✅ Usuario tiles-service creado"
else
    echo "✅ Usuario tiles-service ya existe"
fi

# 2. Crear directorios
echo "📁 Creando directorios de instalación..."
mkdir -p /opt/pvu-tiles
mkdir -p /var/lib/pvu-tiles

# 3. Copiar archivos compilados
echo "📦 Copiando archivos de aplicación..."
cp -r dist node_modules package.json /opt/pvu-tiles/

# 4. Copiar archivo PMTiles si existe
if [ -f "data/durango.pmtiles" ]; then
    echo "🗺️  Copiando archivo PMTiles..."
    cp data/durango.pmtiles /var/lib/pvu-tiles/
    echo "✅ durango.pmtiles copiado ($(du -h data/durango.pmtiles | cut -f1))"
else
    echo "⚠️  Advertencia: data/durango.pmtiles no encontrado"
    echo "   Deberás copiar manualmente el archivo a /var/lib/pvu-tiles/"
fi

# 5. Configurar permisos
echo "🔒 Configurando permisos..."
chown -R tiles-service:tiles-service /opt/pvu-tiles
chown -R tiles-service:tiles-service /var/lib/pvu-tiles
chmod 755 /opt/pvu-tiles
chmod 755 /var/lib/pvu-tiles
if [ -f "/var/lib/pvu-tiles/durango.pmtiles" ]; then
    chmod 644 /var/lib/pvu-tiles/durango.pmtiles
fi

# 6. Instalar servicio systemd
echo "⚙️  Instalando servicio systemd..."
cp config/pvu-tiles.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable pvu-tiles

# 7. Reiniciar servicio
echo "🔄 Iniciando servicio..."
systemctl restart pvu-tiles

# 8. Esperar y verificar estado
sleep 3
if systemctl is-active --quiet pvu-tiles; then
    echo "✅ Servicio pvu-tiles está activo"
    systemctl status pvu-tiles --no-pager
    echo ""
    echo "🌐 Verificar en: http://localhost:3000/health"
else
    echo "❌ Error: El servicio no pudo iniciarse"
    echo "Ver logs con: sudo journalctl -u pvu-tiles -n 50"
    exit 1
fi

echo ""
echo "✅ Despliegue completado exitosamente"
echo "📋 Comandos útiles:"
echo "   - Ver logs: sudo journalctl -u pvu-tiles -f"
echo "   - Reiniciar: sudo systemctl restart pvu-tiles"
echo "   - Detener: sudo systemctl stop pvu-tiles"
echo "   - Estado: sudo systemctl status pvu-tiles"
