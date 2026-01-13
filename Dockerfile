# QGIS Server using Camptocamp image - Fixed for Code Engine
FROM camptocamp/qgis-server:3.34

LABEL maintainer="PVU-GIS Team"

# Environment variables for QGIS
ENV QGIS_PROJECT_FILE=/data/PSD-PVU-LABELS.qgs
ENV QGIS_SERVER_LOG_LEVEL=0
ENV QGIS_SERVER_LOG_STDERR=1
ENV QGIS_SERVER_PARALLEL_RENDERING=true
ENV QGIS_SERVER_MAX_THREADS=4

WORKDIR /data

# Install unzip
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
    && rm -rf /var/lib/apt/lists/*

# Copy and extract project
COPY PSD-PVU-RENAMED.qgz /tmp/
RUN unzip /tmp/PSD-PVU-RENAMED.qgz -d /data && rm /tmp/PSD-PVU-RENAMED.qgz

# Copy shapefiles
COPY Marco_Geoestadistico/ /data/Marco_Geoestadistico/
COPY Micro_Regionalizacion_Sector/ /data/Micro_Regionalizacion_Sector/

# Fix Apache to listen on port 8080 directly in config files
RUN sed -i 's/Listen 80$/Listen 8080/' /etc/apache2/ports.conf && \
    sed -i 's/<VirtualHost \*:80>/<VirtualHost *:8080>/' /etc/apache2/sites-enabled/000-default.conf

# Enable CORS headers for WMS requests
RUN a2enmod headers && \
    printf '<IfModule mod_headers.c>\n    Header set Access-Control-Allow-Origin "*"\n    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"\n    Header set Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept"\n</IfModule>\n' > /etc/apache2/conf-available/cors.conf && \
    a2enconf cors

# Create a new clean startup script that doesn't change the port
RUN printf '#!/bin/bash -e\n\
    if [ -e /etc/qgisserver/fonts/ ]; then fc-cache --really-force --system-only; fi\n\
    ${GET_ENV} ${FILTER_ENV} | sed -e '\''s/^\\([^=]*\\)=.*/PassEnv \\1/'\'' > /tmp/pass-env\n\
    ${GET_ENV} ${FILTER_ENV} | sed -e '\''s/.\\+/export \"\\0\"/'\'' > /tmp/init-env\n\
    trap '\''echo "caught SIGTERM"; kill -TERM $PID; wait $PID'\'' TERM\n\
    trap '\'''\'' WINCH\n\
    rm -f "${APACHE_PID_FILE}"\n\
    exec apache2 -DFOREGROUND\n\
    ' > /usr/local/bin/start-server && chmod +x /usr/local/bin/start-server

EXPOSE 8080
