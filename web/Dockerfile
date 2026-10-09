# PVU WebGIS - Nginx container for static files
FROM nginx:alpine

# Copy web files
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY logger.js /usr/share/nginx/html/
COPY config.js /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/

# Custom nginx config for SPA and CORS
RUN echo 'server { \
    listen 8080; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # Gzip compression for performance \
    gzip on; \
    gzip_types text/plain text/css application/javascript application/json; \
    gzip_min_length 1000; \
    \
    # Cache static assets \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { \
    expires 7d; \
    add_header Cache-Control "public, immutable"; \
    } \
    \
    # SPA fallback \
    location / { \
    try_files $uri $uri/ /index.html; \
    } \
    \
    # Health check \
    location /health { \
    access_log off; \
    return 200 "OK"; \
    add_header Content-Type text/plain; \
    } \
    }' > /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
