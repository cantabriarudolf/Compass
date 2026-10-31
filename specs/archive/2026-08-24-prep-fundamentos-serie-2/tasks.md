## 1. Specs principales

- [x] 1.1 Aplicar delta ST-capa-datos-persistente (media por referencia + centro de notificaciones) sobre `openspec/specs/ST-capa-datos-persistente/spec.md`
- [x] 1.2 Aplicar delta CF-configuracion-global (parámetros legales Chile) sobre `openspec/specs/CF-configuracion-global/spec.md`
- [x] 1.3 Aplicar delta MA-maestros-administrativos (colecciones afp/salud/asignacionFamiliar) sobre `openspec/specs/MA-maestros-administrativos/spec.md`

## 2. project.md

- [x] 2.1 Añadir convención "1 módulo NSGC = 1 change OpenSpec" (PE puede partirse en 2) a Development Conventions
- [x] 2.2 Añadir a la tabla cruzada: `AU-autenticacion-sesion`, `SG-hardening-despliegue`, `LAB-mejoras`, `DEV-qa-lab`
- [x] 2.3 Actualizar lista "Remaining NSGC modules" (quitar lo ya cubierto; mantener AD GD FI CO PL IN GE IR RA RE PI MT CT + estado parcial de AU)
- [x] 2.4 Registrar decisión de motor PDF (pdfmake) y política de notificaciones simuladas como notas de convención

## 3. Validación

- [x] 3.1 `openspec validate --all` sin fallos
- [x] 3.2 Verificar que ningún requisito nuevo duplique títulos existentes en las 3 specs
