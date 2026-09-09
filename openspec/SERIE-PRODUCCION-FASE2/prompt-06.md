> **Este archivo ES tu prompt.** Ventana P6 (CIERRE) de la serie produccion-fase2.
> Léelo completo (incluido `00-plan.md` de la serie) y ejecuta sus bloques en orden.

## Contexto común (válido para TODA la serie produccion-fase2)

Estado previo: Compass, Next.js 16, PostgreSQL en Neon. Tests: 552+ unit. CI/CD completo. 2FA/TOTP. Cifrado AES-256. Sentry. CSP enforcement.

Método: openspec-propose → apply → archive → commit → nsgc-prepush.
Reglas: secretos jamás en localStorage; cambio de esquema store = bump STORE_VERSION + migrate + test.
Verificación: tsc 0 errores, lint 0 errores, npm test verde, openspec validate OK.

## Arranque: verificación de la ventana anterior (P5)

1. git status (tree limpio) y git status -sb y git log --oneline -15.
2. openspec validate --all → sin fallos.
3. cd k0mp4ss_fe/apps/web && npm test → suite completa verde.
4. Contrasta con openspec/SERIE-PRODUCCION-FASE2/00-plan.md:
   - Filas P1-P5 HECHAS y todo OK → marca tu fila P6 EN CURSO y continúa.
   - HECHA pero algo falla → ARREGLA primero.
   - PARCIAL → completa ESE alcance antes del tuyo.
5. Nunca marques tu fila EN CURSO si lo anterior no está cerrado.

## Alcance de esta ventana (P6 — Política de privacidad + derechos ARCO + cierre)

### Tarea 1: Página de política de privacidad

1. Crear `app/privacidad/page.tsx`:
   - Texto de política de privacidad básica en español
   - Secciones: qué datos recolectamos, para qué, cómo los protegemos, derechos del usuario, contacto
   - NO es contenido legal definitivo (el owner debe revisar con abogado), pero es un scaffold funcional
   - Enlace en footer o menú de configuración
2. Crear `app/terminos/page.tsx` (términos de uso) — scaffold mínimo

### Tarea 2: API para derechos ARCO

Crear `app/api/mis-datos/route.ts`:
1. **GET** `/api/mis-datos` — autenticado:
   - Retorna TODOS los datos personales del usuario autenticado
   - Incluye: perfil, membresías, actividad (eventos de auditoría donde aparece)
   - Formato: JSON estructurado, fácil de leer
2. **DELETE** `/api/mis-datos` — autenticado:
   - Solicitud de eliminación de datos (derecho a olvido)
   - NO elimina inmediatamente (riesgo de integridad referencial)
   - Marca el usuario como `solicitudEliminacion: true` + fecha
   - Loguea la solicitud en `EventoAuditoria`
   - Retorna: "Solicitud registrada. Será procesada en un plazo de 30 días."
3. **PATCH** `/api/mis-datos` — autenticado:
   - Permite actualizar datos personales (nombre, teléfono, email)
   - Valida con Zod
   - Loguea cambios en auditoría

### Tarea 3: UI para derechos ARCO

1. Crear `app/admin/mis-datos/page.tsx`:
   - Vista de "Mis datos personales" para el usuario logueado
   - Muestra datos en formato legible
   - Botón "Descargar mis datos" (exporta JSON)
   - Botón "Solicitar eliminación" (con confirmación y explicación de consecuencias)
   - Formulario para actualizar datos personales
2. Accesible solo para usuarios autenticados (redirect a /ingresar si no)

### Tarea 4: Banner de consentimiento

1. Crear componente `components/consent-banner.tsx`:
   - Banner flotante en la parte inferior de la pantalla
   - Texto: "Utilizamos cookies y procesamos datos personales según nuestra política de privacidad. Al continuar, aceptas estos términos."
   - Botón "Aceptar" — guarda consentimiento en cookie/localStorage
   - Botón "Ver política" — link a /privacidad
2. Mostrar solo si el usuario no ha aceptado aún
3. En `app/layout.tsx`: incluir el banner

### Tarea 5: QA integral de cierre

1. Verificación completa:
   - `git status` limpio
   - `git log --oneline -25` (todos los commits de P1-P6)
   - `openspec validate --all` sin fallos
   - `npx tsc --noEmit` → 0 errores
   - `npm run lint` → 0 errores
   - `npm test` → suite completa verde
2. Actualizar `openspec/SERIE-PRODUCCION-FASE2/00-plan.md`:
   - Marcar TODAS las filas P1-P6 como HECHAS
   - Añadir entradas en Bitácora por cada ventana
3. Actualizar `openspec/BACKLOG-100.md`:
   - Añadir sección "SERIE-PRODUCCION-FASE2 COMPLETA"
   - Listar lo que queda (pen-test, auditoría externa, registro Agencia)
4. Commit final: `docs(ops): cierre SERIE-PRODUCCION-FASE2 — privacidad, ARCO, consentimiento`

### Tarea 6: Memoria en engram

1. `mem_save` con título "SERIE-PRODUCCION-FASE2 completada — producto seguro y compliant"
2. Incluir resumen de todas las ventanas y métricas finales.

## Reporte final estandarizado (OBLIGATORIO — cierre de serie)

1. Ventana y estado: P6 HECHA/PARCIAL + motivo.
2. Commits: hash + subject y push sí/no.
3. Specs creadas/modificadas + changes archivados.
4. Números: STORE_VERSION, tests X/Y, tsc/eslint OK, lint 0.
5. Desviaciones vs el prompt.
6. **Post-serie (pendientes):**
   - Pen-test dinámico
   - Auditoría de seguridad externa
   - Registro como encargado de datos (Ley 21.719)
7. Última línea exacta: `BITACORA_ENTRY: P6 — Cierre serie: privacidad, ARCO, consentimiento + BACKLOG-100 actualizado (commit <hash>)`.
