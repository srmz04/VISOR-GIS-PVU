# Plan de Implementación: Despliegue en Servidor Institucional

## Objetivo

Desplegar el servidor de tiles VISOR-GIS-PVU en el servidor institucional Ubuntu (IP: 10.6.35.42) usando el entry point Node.js (`src/server.ts`) con gestión vía systemd.

---

## Contexto del Servidor

- **IP:** 10.6.35.42 (Red interna)
- **Acceso:** SSH y RDP habilitado
- **Usuario:** `epidemiologia`
- **SO Esperado:** Ubuntu/Debian (a confirmar)
- **Casos de Uso:** Servir tiles internamente a aplicaciones del ecosistema de Salud Durango

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────┐
│   Clientes (Web Apps Internas)          │
└──────────────┬──────────────────────────┘
               │ HTTP/HTTPS
               ▼
┌─────────────────────────────────────────┐
│   Nginx Reverse Proxy (Opcional)        │
│   - HTTPS con certificado interno       │
│   - Rate Limiting                       │
│   - Compresión gzip                     │
└──────────────┬──────────────────────────┘
               │ localhost:3000
               ▼
┌─────────────────────────────────────────┐
│  Node.js Server (Hono + FileSystemAdapter)│
│  - Puerto: 3000                         │
│  - Systemd: auto-restart                │
│  - User: tiles-service (no-root)        │
└──────────────┬──────────────────────────┘
               │ Filesystem Read
               ▼
┌─────────────────────────────────────────┐
│   /var/lib/pvu-tiles/durango.pmtiles    │
│   - Permisos: 644                       │
│   - Owner: tiles-service:tiles-service  │
└─────────────────────────────────────────┘
```

---

## Cambios Propuestos

### 1. Instalación de Dependencias

#### [NEW] [install.sh](file:///home/uy/Dropbox/srmz04/GIS/VISOR-GIS-PVU/scripts/install.sh)

Script de instalación automatizado:

```bash
#!/bin/bash
# Script de instalación para Ubuntu 20.04/22.04/24.04

# Verificar Node.js 18+
if ! command -v node &> /dev/null; then
    echo "Instalando Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Instalar dependencias del proyecto
npm install --production

# Compilar TypeScript
npm run build:node
```

---

### 2. Configuración de Systemd

#### [NEW] [pvu-tiles.service](file:///home/uy/Dropbox/srmz04/GIS/VISOR-GIS-PVU/config/pvu-tiles.service)

```ini
[Unit]
Description=VISOR-GIS-PVU Tile Server
After=network.target

[Service]
Type=simple
User=tiles-service
Group=tiles-service
WorkingDirectory=/opt/pvu-tiles
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=10

# Variables de entorno
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="TILES_PATH=/var/lib/pvu-tiles"

# Hardening de seguridad
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/pvu-tiles
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

# Límites de recursos
LimitNOFILE=65536
MemoryLimit=512M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
```

---

### 3. Script de Despliegue

#### [NEW] [deploy.sh](file:///home/uy/Dropbox/srmz04/GIS/VISOR-GIS-PVU/scripts/deploy.sh)

```bash
#!/bin/bash
set -e

echo "=== Despliegue VISOR-GIS-PVU Tile Server ==="

# 1. Crear usuario de sistema
sudo useradd -r -s /bin/false tiles-service || true

# 2. Crear directorios
sudo mkdir -p /opt/pvu-tiles
sudo mkdir -p /var/lib/pvu-tiles

# 3. Copiar archivos
sudo cp -r dist node_modules package.json /opt/pvu-tiles/
sudo cp data/durango.pmtiles /var/lib/pvu-tiles/

# 4. Configurar permisos
sudo chown -R tiles-service:tiles-service /opt/pvu-tiles
sudo chown -R tiles-service:tiles-service /var/lib/pvu-tiles
sudo chmod 755 /opt/pvu-tiles
sudo chmod 755 /var/lib/pvu-tiles
sudo chmod 644 /var/lib/pvu-tiles/durango.pmtiles

# 5. Instalar servicio systemd
sudo cp config/pvu-tiles.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pvu-tiles
sudo systemctl restart pvu-tiles

# 6. Verificar estado
sleep 3
sudo systemctl status pvu-tiles

echo "✅ Despliegue completado. Verificar en http://localhost:3000/health"
```

---

### 4. Configuración de Nginx (Opcional)

#### [NEW] [nginx-pvu-tiles.conf](file:///home/uy/Dropbox/srmz04/GIS/VISOR-GIS-PVU/config/nginx-pvu-tiles.conf)

```nginx
upstream pvu_tiles {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name tiles.salud.gob.mx;  # Ajustar según dominio interno

    # Redirigir a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tiles.salud.gob.mx;

    # Certificados SSL (generar con Let's Encrypt o certificados internos)
    ssl_certificate /etc/ssl/certs/pvu-tiles.crt;
    ssl_certificate_key /etc/ssl/private/pvu-tiles.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Headers de seguridad
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logs
    access_log /var/log/nginx/pvu-tiles-access.log;
    error_log /var/log/nginx/pvu-tiles-error.log;

    # Proxy a Node.js
    location / {
        proxy_pass http://pvu_tiles;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Soporte para Range Requests (crítico para PMTiles)
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Rate Limiting (100 req/s por IP)
        limit_req zone=tiles_limit burst=20 nodelay;
    }

    # Cache de tiles (opcional, requiere nginx-cache-purge)
    location ~* ^/tiles/ {
        proxy_pass http://pvu_tiles;
        proxy_cache tiles_cache;
        proxy_cache_valid 200 24h;
        proxy_cache_use_stale error timeout updating;
        add_header X-Cache-Status $upstream_cache_status;
    }
}

# Zona de rate limiting
limit_req_zone $binary_remote_addr zone=tiles_limit:10m rate=100r/s;

# Zona de cache (opcional)
proxy_cache_path /var/cache/nginx/tiles levels=1:2 keys_zone=tiles_cache:10m max_size=1g inactive=24h;
```

---

## Plan de Verificación

### 1. Tests Automatizados (Locales)

```bash
# Health check
curl http://localhost:3000/health

# Metadata
curl http://localhost:3000/metadata

# Tile específico
curl http://localhost:3000/tiles/10/200/400.pbf -I
```

### 2. Tests de Carga (Opcional)

```bash
# Usando Apache Bench
ab -n 1000 -c 10 http://localhost:3000/health

# Usando wrk
wrk -t4 -c100 -d30s http://localhost:3000/tiles/10/200/400.pbf
```

### 3. Monitoreo de Logs

```bash
# Ver logs del servicio
sudo journalctl -u pvu-tiles -f

# Ver logs de Nginx
sudo tail -f /var/log/nginx/pvu-tiles-access.log
```

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Puerto 3000 ya ocupado | Media | Alto | Verificar `netstat -tulpn` antes, cambiar puerto si necesario |
| Falta de espacio en disco | Baja | Alto | Verificar `df -h`, el PMTiles ocupa ~28MB |
| Firewall bloqueando tráfico | Media | Alto | Configurar `ufw allow 3000/tcp` |
| Falta Node.js 18+ | Media | Bloqueante | Instalar vía `nodesource` script |
| Permisos insuficientes | Media | Alto | Ejecutar con `sudo` según necesidad |

---

## Cronograma Estimado

| Fase | Duración | Dependencias |
|------|----------|--------------|
| Acceso y diagnóstico | 15 min | SSH habilitado |
| Instalación dependencias | 10 min | Internet en servidor |
| Configuración systemd | 20 min | - |
| Pruebas funcionales | 15 min | - |
| Nginx (opcional) | 30 min | Certificados SSL |
| **Total** | **1-1.5 horas** | - |

---

## Próximos Pasos

1. ✅ Aprobar este plan
2. Conectar vía SSH al servidor para diagnóstico inicial
3. Crear scripts de instalación y despliegue
4. Ejecutar despliegue en servidor
5. Verificar funcionamiento y documentar URL interna
