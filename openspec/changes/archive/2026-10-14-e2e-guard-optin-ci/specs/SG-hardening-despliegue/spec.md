## MODIFIED Requirements

### Requirement: Re-chequeos D-iii scripted repetibles 5/5 (D-iii)

El sistema SHALL proveer re-chequeos convertidos en script repetible: `k0mp4ss_fe/apps/web/scripts/security-recheck.mjs` (node, invocación handlers directa sin requerir `next start` en puerto efímero) y `k0mp4ss_fe/apps/web/test/security-rechecks.test.ts` (vitest integración) que verifican 5 casos imprimiendo `OK`/`FAIL` por check y fallando el proceso si alguno no pasa (exit 1 o `expect` fallido). Los checks SHALL ser: (1) `POST /api/backup` con payload >10 MB → `413`; (2) APIs escritura (`POST /api/backup`, `GET`/`POST`/`PUT`/`PATCH /api/dev-dashboard`) con `APP_ENV=production` (`NEXT_PUBLIC_APP_ENV=production`/`APP_ENV=production` → `isWriteApiEnabled()=false`) → `404`; (3) path traversal `changeId` en `toggleTask`/dev-dashboard (`"../../etc/passwd"`, `"..%2F..%2Fetc%2Fpasswd"`) → `404`/sanitizado via `SAFE_CHANGE_ID`/`readProjectFile` allowlist; (4) `proxy` `GET /admin/*` sin cookie de sesión → redirect `307`/`308` a `/ingresar?next={ruta}`; (5) `proxy`/`GET /api/admin/usuarios` (o `/api/*`) sin sesión → `401` JSON `No autenticado`. El script SHALL usar `NextRequest`/`Request` reales y helper `test/helpers/sesion-authjs.ts` donde aplique, y el límite `next build` por Fonts SHALL estar documentado (alternativa `next dev` en puerto efímero o handlers directos descrita en `design.md`).

**Opt-in de la lane e2e con doble candado**: `isWriteApiEnabled()` (`lib/env-guard.ts`) SHALL aceptar un opt-in explícito `E2E_ALLOW_WRITE_APIS=1` que habilita las APIs de escritura cuando `NODE_ENV=production` (el build de producción que sirve la lane e2e) **únicamente si** el entorno efectivo de la app es desarrollo (`getAppEnv() === "development"`). El opt-in por sí solo SHALL NO habilitar nada: un entorno con `NEXT_PUBLIC_APP_ENV=production`/`APP_ENV=production` sigue respondiendo `404` en APIs de escritura aunque `E2E_ALLOW_WRITE_APIS` esté seteado (producción/Vercel intacta). El valor del opt-in SHALL ser exactamente `"1"`. El opt-in SHALL cablearse SOLO en el env del job `e2e` de `.github/workflows/ci.yml` y SHALL documentarse en `docs/runbook-operaciones.md` como exclusivo del entorno de pruebas/e2e.

#### Scenario: 5/5 re-chequeos OK
- **WHEN** se ejecuta `node scripts/security-recheck.mjs` (o `npm run check:rechecks`/`npm test` incluye `security-rechecks`)
- **THEN** imprime `[1/5] backup >10MB → 413: OK` … `[5/5] API sin sesión → 401: OK` y termina con `5/5 OK` y exit 0; si algún check falla imprime `FAIL` y exit 1 / test rojo.

#### Scenario: backup 413 por >10MB
- **WHEN** `POST /api/backup` con `content-length` >10 MB o body `Buffer.byteLength > 10*1024*1024`
- **THEN** responde `413` con `error: "Solicitud demasiado grande"`; con ≤10 MB no es 413.

#### Scenario: escritura en production → 404
- **WHEN** `process.env.NEXT_PUBLIC_APP_ENV="production"` y se llama `GET /api/dev-dashboard` o `POST /api/backup`
- **THEN** responde `404` con `error: "Not Found"` antes de auth (env-guard), independiente de sesión.

#### Scenario: path traversal sanitizado → 404
- **WHEN** `toggleTask("../../etc/passwd","1.0")` o `PATCH /api/dev-dashboard` con `changeId: "../../etc/passwd"`
- **THEN** retorna `null`/responde `404` (`Recurso no encontrado`/`Recurso no disponible`) y `readProjectFile("../../etc/passwd")` retorna `null` (allowlist `ALLOWED_FILE_PREFIXES`).

#### Scenario: admin sin cookie → redirect /ingresar?next=
- **WHEN** `proxy` recibe `NextRequest("http://localhost/admin/qa-lab")` sin cookie
- **THEN** responde `307` o `308` con `location` conteniendo `/ingresar?next=%2Fadmin%2Fqa-lab`.

#### Scenario: API sin sesión → 401
- **WHEN** `proxy` o handler `GET /api/admin/usuarios?comunidadId=x` recibe request sin cookie de sesión Auth.js
- **THEN** responde `401` JSON `error: "No autenticado."`.

#### Scenario: Opt-in E2E_ALLOW_WRITE_APIS con doble candado habilita la lane e2e
- **WHEN** `NODE_ENV=production` (build servido por la lane e2e), `NEXT_PUBLIC_APP_ENV=development` y `E2E_ALLOW_WRITE_APIS=1`
- **THEN** `isWriteApiEnabled()` retorna `true` y la limpieza bulk del QA-Lab (`POST /api/qa-lab/purga-test`) responde 200, permitiendo que la limpieza de cola estricta de 120 s pase por el camino bulk.

#### Scenario: Sin opt-in el comportamiento es el de hoy (bloqueado)
- **WHEN** `NODE_ENV=production` y `NEXT_PUBLIC_APP_ENV=development` sin `E2E_ALLOW_WRITE_APIS` (o con valor distinto de `"1"`)
- **THEN** `isWriteApiEnabled()` retorna `false` y las APIs de escritura responden `404`, igual que antes del opt-in.

#### Scenario: Producción bloqueada aunque el opt-in esté seteado
- **WHEN** `NEXT_PUBLIC_APP_ENV=production` (o `APP_ENV=production`) y `E2E_ALLOW_WRITE_APIS=1`, con o sin `NODE_ENV=production`
- **THEN** `isWriteApiEnabled()` retorna `false` y las APIs de escritura responden `404` antes de auth.
