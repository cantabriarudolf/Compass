# SG - Hardening y Despliegue

Checklist técnico de seguridad para completar la Fase C restante (pre-Base de Datos) y ejecutar íntegramente la Fase D (pre-deploy a producción). Derivado del consolidado de auditorías `Data/NSGC/docs/auditorias/consolidado - 2026-08-24.md`. Una IA que retome este documento debe tratar cada sección como tarea verificable, con su criterio de aceptación.

## Contexto de decisiones ya tomadas por el owner

- **D1 ORM:** Prisma. **D2 Auth:** Auth.js (ver `AU - Autenticacion y Sesion.md`). **D3 Multi-comunidad:** tenant compartido con `comunidadId` + scoping en repositorio. **D4 Identidad:** RUT módulo 11 + pasaporte explícito (implementado). **D5 Unicidad:** repetidos permitidos con aviso UI. **D6 Cuenta bloqueada:** bloqueo duro en vínculos (implementado).

## 1. Fase C — pendiente al migrar a BD

| # | Tarea | Criterio de aceptación |
|---|---|---|
| C1 | Modelo Prisma con `comunidadId` en toda entidad de dominio; migración inicial desde los tipos de `lib/schemas.ts` | `prisma migrate dev` corre limpio; todo modelo de dominio tiene `comunidadId` indexado |
| C1b | Repositorios con scoping obligatorio por `comunidadId` + tests de aislamiento entre comunidades A/B | Un test intenta leer/escribir cross-comunidad y falla; ningún repositorio expone query sin scope |
| C2-final | Trasladar SMTP y clave de eliminación maestro a variables de entorno del servidor (`SMTP_PASSWORD`, etc.) y borrar los campos del store cliente | Los campos ya no existen en `ConfiguracionGlobalSchema`; el envío real ocurre server-side |
| C3b | Constraint de unicidad opcional en BD compuesta (ej. unidad única por micro sector), no global | Decidir tabla por tabla; documentar cada constraint añadida |
| C4 | **Variables de entorno obligatorias de la ventana 2026-11-12** | ver §2.1 |

## 2.1 Variables de entorno que el despliegue debe declarar

Dos variables nuevas nacieron con las capacidades de la ventana del 2026-11-12. **Las dos fallan cerrado**: sin ellas el sistema no guarda en claro ni deja pasar el cron, y el error que devuelve nombra la variable que falta. Cargarlas en el proyecto de Vercel (producción y preview) antes de usar las capacidades que dependen de ellas.

| Variable | Para qué | Qué pasa sin ella |
|---|---|---|
| `CLAVE_MAESTRA_SECRETOS` | Clave maestra de 32 bytes (hex o base64) con la que se cifra en la base la credencial SMTP **de cada comunidad** (AES-256-GCM, IV y tag por registro) | Guardar una credencial responde 500 y **no escribe nada**; el envío de prueba no abre conexión. No hay clave por defecto ni valor de relleno en ningún entorno. Rotarla invalida los paquetes guardados: hay que volver a cargar la credencial de cada comunidad |
| `CRON_SECRET` | Secreto que Vercel envía como `Authorization: Bearer` al endpoint del barrido programado de avisos (`GET /api/vigencia-registro/avisos`) | El endpoint responde 500 sin ejecutar nada y el cron diario no hace nada. Vercel sólo agrega el encabezado solo si esta variable existe en el proyecto |

`SMTP_PASSWORD` (global) sigue existiendo como camino heredado para los envíos que todavía no migraron a la credencial por comunidad; la credencial por comunidad, cuando existe, tiene precedencia.

## 2. Estado actual del hardening (ya implementado — no repetir)

## 2. Estado actual del hardening (ya implementado — no repetir)

- `lib/env-guard.ts`: `isWriteApiEnabled()` desactiva APIs de escritura (`/api/backup`, `/api/admin/seed-authz`) con 404 cuando `NEXT_PUBLIC_APP_ENV=production`; límite de 10 MB en backup (413).
- SEC-005 parcial: `partialize` del store vacía `smtpPassword` y `claveEliminacionMaestro` antes de persistir; la UI lo indica con placeholder. El traslado definitivo es C2-final.
- Sesión y protección de rutas: ver `AU - Autenticacion y Sesion.md`.
- Validación de identidad: `lib/rut.ts` (módulo 11 + pasaporte) integrada en `DocumentoIdentidadSchema`; migración v10 repara RUTs históricos con DV ficticio.
- Umbrales de cobertura Vitest: statements ≥90, branches ≥75, functions ≥85, lines ≥90.

## 3. Fase D — checklist pre-deploy

| # | Tarea | Detalle |
|---|---|---|
| D-i | CSP estricta | Content-Security-Policy con nonces/hashes para los scripts inline de Next.js; auditar orígenes de imágenes/fuentes; empezar en modo report-only y revisar telemetría antes de forzar |
| D-ii | Headers contra dominio definitivo | HSTS (con preload), X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; verificar en securityheaders.com |
| D-iii | Re-chequeos manuales | `POST /api/backup` con >10MB → 413; APIs de escritura con `APP_ENV=production` → 404; lectura de archivo con path traversal (`changeId: "../../etc"`) → 404; acceso sin cookie a `/admin/*` → redirect a `/ingresar`; API sin sesión → 401 |
| D-iv | Re-auditoría OWASP completa | Usar skill `code-review-security`; nuevo informe en `Data/NSGC/docs/auditorias/` registrado en `00-index.md`; cero hallazgos 🔴 abiertos como condición de salida |
| D-v | Rate limiting persistente | Al existir BD/Redis, mover el límite de login fuera de memoria del proceso |
| D-vi | Backups | Backup automático diario de la BD gestionada + restauración probada una vez |

## 4. Reglas permanentes de seguridad

1. Nunca confiar en el navegador: toda regla de negocio se valida también server-side (Zod en route handlers).
2. Ningún secreto en código, localStorage ni logs; `.env.local` gitignored.
3. Mensajes de error genéricos hacia el cliente; detalles solo en logs del servidor.
4. Todo endpoint nuevo nace protegido por defecto; abrirlo exige justificación escrita en `RUTAS_PUBLICAS` o spec.
5. Cambios de esquema de persistencia ⇒ bump de `STORE_VERSION` + migración reparadora + test de regresión con datos viejos reales (patrón v9/v10).
