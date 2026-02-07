#!/bin/bash
# Script de instalación para Ubuntu 20.04/22.04/24.04
set -e

echo "=== Instalación de Dependencias VISOR-GIS-PVU ==="

# Verificar Node.js 18+
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no encontrado. Instalando Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "❌ Node.js $NODE_VERSION detectado. Se requiere versión 18+. Actualizando..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo "✅ Node.js $(node -v) encontrado"
    fi
fi

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm no encontrado. Instalando..."
    sudo apt-get install -y npm
else
    echo "✅ npm $(npm -v) encontrado"
fi

# Instalar dependencias del proyecto
echo "📦 Instalando dependencias del proyecto..."
npm install --production

# Compilar TypeScript
echo "🔨 Compilando TypeScript..."
npm run build:node

echo "✅ Instalación completada"
