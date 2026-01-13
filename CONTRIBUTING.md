# Guía de Contribución

Gracias por tu interés en contribuir a PVU WebGIS. Este documento explica cómo puedes participar en el desarrollo del proyecto.

---

## Formas de Contribuir

### 1. Reportar Bugs

Si encuentras un error:

1. Verifica que no exista ya un [Issue](https://github.com/TU_USUARIO/pvu-webgis/issues) reportándolo
2. Crea un nuevo Issue con:
   - Descripción clara del problema
   - Pasos para reproducirlo
   - Comportamiento esperado vs. actual
   - Capturas de pantalla si aplica
   - Navegador y sistema operativo

### 2. Sugerir Mejoras

Las ideas son bienvenidas:

1. Abre un Issue con etiqueta `enhancement`
2. Describe la funcionalidad propuesta
3. Explica el caso de uso
4. Si es posible, incluye mockups o ejemplos

### 3. Contribuir Código

Para enviar cambios al código:

#### Proceso

```
1. Fork del repositorio
2. Clonar tu fork localmente
3. Crear una rama para tu cambio
4. Hacer tus modificaciones
5. Probar que funciona
6. Commit con mensaje descriptivo
7. Push a tu fork
8. Crear Pull Request
```

#### Comandos

```bash
# 1. Clonar tu fork
git clone https://github.com/srmz04/VISOR-GIS-PVU.git
cd VISOR-GIS-PVU

# 2. Crear rama
git checkout -b feature/mi-mejora

# 3. Hacer cambios y probar
# ... editas archivos ...
cd web && python3 -m http.server 3000
# Prueba en http://localhost:3000

# 4. Commit
git add .
git commit -m "Agrega funcionalidad X para mejorar Y"

# 5. Push
git push origin feature/mi-mejora

# 6. Ir a GitHub y crear Pull Request
```

---

## Estándares de Código

### JavaScript

- Usar `const` y `let`, evitar `var`
- Comentarios en español
- Nombres de variables y funciones descriptivos
- Funciones pequeñas con responsabilidad única

### CSS

- Variables CSS para colores y espaciado
- Mobile-first cuando sea posible
- Evitar `!important`

### Commits

Formato recomendado:

```
tipo: descripción corta

Descripción más detallada si es necesario.
```

Tipos:
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `docs`: Cambios en documentación
- `style`: Formato, sin cambios de lógica
- `refactor`: Reestructuración de código
- `test`: Agregar o modificar tests

Ejemplo:
```
feat: agrega búsqueda por municipio

Implementa filtro de búsqueda que permite buscar
localidades filtrando primero por municipio.
```

---

## Pull Requests

### Antes de enviar

- [ ] El código funciona localmente
- [ ] No hay errores en la consola del navegador
- [ ] Los cambios están en una rama separada (no en `main`)
- [ ] El commit tiene un mensaje descriptivo

### Proceso de revisión

1. Envías el PR
2. Reviso los cambios (generalmente en 1-7 días)
3. Puedo pedir modificaciones o aclaraciones
4. Una vez aprobado, hago merge a `main`

---

## Preguntas

Si tienes dudas sobre cómo contribuir:

- Abre un Issue con etiqueta `question`
- O escribe a s.ramirez.s@gmail.com

---

## Reconocimiento

Todos los contribuidores serán listados en el README y en los releases donde participen.

Gracias por hacer este proyecto mejor.
