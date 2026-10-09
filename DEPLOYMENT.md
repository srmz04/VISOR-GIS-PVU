# Guía Rápida de Despliegue en Servidor Ubuntu

## Servidor Institucional

- **IP:** 10.6.35.42
- **Usuario:** epidemiologia
- **Contraseña:** 

## Pasos de Despliegue

### 1. Conectarse al Servidor

```bash
ssh epidemiologia@10.6.35.42
```

### 2. Clonar el Repositorio

```bash
cd /tmp
git clone https://github.com/srmz04/VISOR-GIS-PVU.git
cd VISOR-GIS-PVU
```

### 3. Instalar Dependencias

```bash
./scripts/install.sh
```

### 4. Desplegar el Servicio

```bash
sudo ./scripts/deploy.sh
```

### 5. Verificar

```bash
# Ver estado del servicio
sudo systemctl status pvu-tiles

# Probar endpoint
curl http://localhost:3000/health
```

## Archivos Importantes

- `scripts/install.sh` - Instalación de Node.js y dependencias
- `scripts/deploy.sh` - Despliegue completo con systemd
- `config/pvu-tiles.service` - Configuración del servicio
- `config/nginx-pvu-tiles.conf` - Reverse proxy opcional
- `DEPLOYMENT_PLAN.md` - Plan detallado de implementación

## Comandos Útiles

```bash
# Ver logs
sudo journalctl -u pvu-tiles -f

# Reiniciar servicio
sudo systemctl restart pvu-tiles

# Detener servicio
sudo systemctl stop pvu-tiles
```

## Notas

- El servidor debe ejecutarse desde la red institucional
- Asegúrate de que el archivo `data/durango.pmtiles` esté presente
- El servicio se ejecutará automáticamente en cada reinicio del servidor
