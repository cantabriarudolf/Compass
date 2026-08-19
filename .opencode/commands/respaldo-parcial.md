---
description: "Respaldo parcial mecánico: snapshot validado del store + checkpoint escrito paso a paso, sin archivar ni commitear"
---

Haz un respaldo parcial del trabajo actual para poder cambiar de módulo o de ventana de chat sin perder el hilo. NO archives changes, NO commitees, NO cierres módulos: solo copiar el backup y escribir el checkpoint.

## PASO 0 — Preguntarle al usuario (obligatorio)

Como no ves otras ventanas de chat, DEBES pedirle que te diga explícitamente qué hizo. Preguntá en este orden exacto:

1. **Módulos:** ¿En qué módulos trabajaste en esta sesión? (ej: TU, MA, ES, VU, ST)
2. **Cambios:** ¿Qué cambios hiciste en cada uno? (una oración por módulo, en español simple)
3. **Pendientes:** ¿Qué quedó sin terminar? (lista corta)
4. **Próximo paso:** ¿Qué hay que hacer al retomar? (ej: "terminar de probar MA", "cerrar módulo TU")
5. **Backup JSON:** ¿Exportaste el store desde `/admin/dev-dashboard` → "Exportar datos"? Si es sí, pedí la ruta del archivo descargado.

Si el usuario no sabe o no recuerda algo, escribí "(sin confirmar)" en el checkpoint. No inventes.

## PASO 1 — Estado del repo (automático)

Ejecutar:

```bash
git status --short
git diff --stat
git rev-parse HEAD
git rev-parse origin/main 2>/dev/null || echo "sin upstream"
git log origin/main..main --oneline 2>/dev/null || echo "sin upstream"
```

Anotar en el checkpoint:
- HEAD actual (hash corto).
- `origin/main` actual (hash corto).
- Cantidad de commits locales sin pushear.
- Lista de archivos modificados (copiar de `git status --short`).

## PASO 2 — Snapshot del store (validado)

- Si el usuario pasó una ruta de JSON:
  1. Validar con el checklist de `.opencode/commands/valida-backup.md`.
  2. Si es válido: copiarlo a `Data/NSGC/backups/compass-backup-YYYY-MM-DD-HH-MM.json` (crear la carpeta si no existe).
  3. Si es inválido: NO copiar. Reportar los errores y dejar constancia.
- Si no pasó JSON: escribir "Backup del navegador pendiente" y recordarle que exporte antes de cerrar el navegador.

## PASO 3 — Escribir el checkpoint (mecánico)

Crear o actualizar el archivo `Data/NSGC/docs/avances/avance - YYYY-MM-DD HH-MM.md` con este formato exacto:

```markdown
# Avance - YYYY-MM-DD HH:MM

## 🧊 Respaldo Parcial

**Base del repo:**
- HEAD: `<hash corto>`
- origin/main: `<hash corto>`
- Commits sin pushear: `<N>`

**Archivos modificados en working tree:**
```
<copiar salida de git status --short>
```

**Backup del store:**
- Ubicación: `Data/NSGC/backups/compass-backup-YYYY-MM-DD-HH-MM.json` (o "Pendiente")
- Resultado validación: OK / Errores: ... / Pendiente

## 🛠️ Módulos trabajados

### Módulo X
- Cambios: <respuesta del usuario>
- Pendiente: <respuesta del usuario>

## ✅ Siguiente paso al retomar
<respuesta del usuario>
```

## PASO 4 — Resumen final

Reportar brevemente:
- Dónde quedó el backup (o que está pendiente).
- Dónde quedó el checkpoint.
- Qué hay que hacer al retomar.

Nada de esto commitear.
