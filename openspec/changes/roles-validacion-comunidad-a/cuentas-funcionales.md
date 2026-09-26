# Cuentas funcionales para validación por perfil — comunidad-a

> Documento de trabajo del change `roles-validacion-comunidad-a`.
> Propósito: que las 5 cuentas TEST + admin validen vistas y alcances
> limitados contra datos reales de `comunidad-a`, sin sorpresas de scope.
> Password universal TEST: `Test1234!` (seed-authz). 2FA: desactivado en las 6.

## 1. Decisión: cuál es "esta comunidad"

**`comunidad-a` ("Comunidad Los Aromos TEST") es la comunidad de validación.**
Es lo que manda el diseño: spec RP §Selector de Comunidad, spec AU §Seed
(`admin@test.cl` admin en A+B, resto admin/comité/etc. en A) y la suite e2e
(`?comunidadId=comunidad-a`, journeys contra datos del seed).

La cuenta **admin ya es de esta comunidad** (membresía `administrador` en A,
más otra en B). **No se le agrega `comunidad-backup-a`**: mezclaría
validación con datos restaurados y, peor, **movería su scope** (ver §3).
`backup-a` queda fuera del circuito de validación como archivo de datos.
Si el owner quiere revertir esta decisión: 1 fila en `membresias` (reversible).

## 2. Matriz de cuentas (verificado contra BD dev 2026-09-26)

| Cuenta | Rol | Membresías | Ficha vinculada | Grupos visibles (sidebar) | Grupos ocultos |
| --- | --- | --- | --- | --- | --- |
| `admin@test.cl` | administrador | A (admin), B (admin) | p-5 · Carlos Castillo Ruiz · 13.555.666-1 | Los 8 grupos | — |
| `comite@test.cl` | comite | A | p-6 · Laura Martínez Cárdenas · 14.222.333-3 | Inicio, Finanzas, Comunidad, Sistema | Operaciones, Inventario, Personas, Desarrollo AI (+ Remuneraciones oculto granular) |
| `conserjeria@test.cl` | conserjeria | A | p-4 · Ana María Silva · 19.111.222-9 | Inicio, Operaciones | Finanzas, Comunidad, Inventario, Personas, Desarrollo AI, Sistema |
| `residente@test.cl` | residente | A | p-3 · Roberto Gómez Bolaños · 12.345.678-5 | Inicio, Operaciones, Finanzas, Comunidad | Inventario, Personas, Desarrollo AI, Sistema |
| `mantencion@test.cl` | mantencion | A | p-7 · Pedro Valdés Orellana · 17.444.555-9 | Inicio, Operaciones, Inventario | Finanzas, Comunidad, Personas, Desarrollo AI, Sistema |
| `arrendatario@test.cl` | residente (login) | A | p-arrendatario-1 · Daniela Fuenzalida Soto · 11.111.111-1 | Inicio, Operaciones, Finanzas, Comunidad (igual que residente) | Inventario, Personas, Desarrollo AI, Sistema |

Fuente matriz sidebar: `e2e/auth/roles-accesos.spec.ts` (MATRIZ) + `components/app-sidebar.tsx`.
Detalle granular: Finanzas/Remuneraciones solo admin; Inventario Estructura/Tipos
solo admin (Recursos/Mantenimiento admin+mantencion); Sistema Reportería admin+comité,
resto admin; Personas y Desarrollo AI solo admin.

**Residente y propietario (aclaración 2026-09-26):** la cuenta `residente@test.cl`
SÍ existe (está en la tabla). `propietario` NO es un rol de login — `ROLES` tiene 5
valores y el spec RP define "Propietario / Residente" como un único rol estándar.
La distinción vive en la ficha (`roles[]`) y en `vinculos` (`rol: propietario |
arrendatario`), que usan gastos-comunes, gestión, reportería y actas-GD para la
lógica de dueño vs ocupante. La ficha p-3 ya es `propietario` con 3 unidades
vigentes (u-B-201, u-C-301, u-LC-01): entrando como `residente@test.cl` se validan
los casos de propietario (pago GC, votación, certificado de su unidad). No se crea
cuenta separada de propietario.

**Inquilino (agregado 2026-09-26):** `arrendatario@test.cl` valida el sombrero
arrendatario con login rol `residente` (no existe rol login propio: ROLES son 5).
Ficha p-arrendatario-1 con vínculo `arrendatario` vigente en u-A-101 (`arrendada`,
`permiteVerFinanzas: false`, alcance limitado a validar). Ver `scripts/seed-authz.mjs`.
Login verificado por HTTP (redirect `/dashboard` sin error).

## 3. Para que la cuenta "no salte": mecánica de scope (fijada, no negociable sin spec)

1. **Un request = una comunidad.** `withComunidadScope` toma la ÚLTIMA membresía
   por `createdAt` (`take: 1`). No hay override de cliente ni selector en la UI
   (`CommunityHeader` solo muestra el nombre).
2. **Determinista pero frágil al alta:** si se agrega una membresía nueva a una
   cuenta de validación, su scope CAMBIA en silencio. **Regla: no agregar
   membresías a estas 6 cuentas sin actualizar este documento.**
3. **Admin no bypassea comunidad.** `puede`/`puedeContextual` le dan wildcard
   DENTRO de su comunidad (abre todas las puertas, salta refinamientos ABAC por
   diseño C4), pero fuera de sus comunidades recibe `403 "Sin pertenencia"` como
   cualquier otro (`app/api/admin/usuarios` lo demuestra). Pasa por los mismos
   gates que todos: scope + `puede`. Nada se salta salvo lo diseñado.
4. **Fijación actual:** admin → scope `comunidad-a` (membresía más reciente;
   verificar con `SELECT comunidadId FROM membresias WHERE usuarioId='usuario-admin'
   ORDER BY createdAt DESC LIMIT 1` si algo se ve raro).

## 4. Qué valida cada perfil (checklist manual, ~15 min)

- [ ] **Login** con cada cuenta → cae en `/dashboard` sin errores.
- [ ] **Sidebar**: grupos visibles/ocultos según §2 (comparar a ojo).
- [ ] **Admin**: `/admin/maestros` con datos (8 tipos), `/admin/permisos` matriz
      visible, `/admin/logs`, `/admin/gestion`.
- [ ] **Residente**: Mis datos muestra SU ficha (Roberto Gómez); reserva RA y
      certificado CT de su unidad; morosidad solo si autorizada.
- [ ] **Conserjería**: registra visita en bitácora; sin Finanzas ni Sistema.
- [ ] **Comité**: lista Finanzas y Sistema; NO puede crear gasto; Remuneraciones oculta.
- [ ] **Mantención**: ve MT, registra incidente IR; sin Finanzas ni Comunidad.
- [ ] **Denegación**: con rol no-admin, `fetch("/api/admin/usuarios?comunidadId=comunidad-a")`
      → `403` (en consola del navegador); con admin → `200`.

## 5. Catálogo de pruebas actual (contado del repo, no estimado)

- **Unit/integración (vitest): 82 archivos** en `test/**` + `lib/**`. Último dato:
  795 passed + 14 skipped (SERIE-BD-5B). Costo bajo: archivo ~30 s, full ~5 min.
- **E2E (playwright): 43 specs** — auth 5, crud 32, flujo 3, smoke 2, a11y 1.
  Clave por perfil: `e2e/auth.setup.ts` (5 storageStates), `e2e/auth/roles-accesos.spec.ts`
  (matriz + 403), `e2e/crud/roles-journeys.spec.ts` (journeys felices que crean sus
  propios TEST-*). Costo alto: ~10-20 min, requiere servidor + chromium.
- **Estáticos**: `tsc --noEmit` + `eslint` (~2 min).
- **Scripts**: `check:headers`, `security-recheck`, `GET /api/health`.
- **Visual (con ojos)**: `playwright-report` HTML tras e2e, `coverage` HTML tras unit.
- Nota: la skill `pruebas` (ejecución) se retiró con opencode; el handoff de
  ejecución se redefine (serie modo delegado o corridas manuales).

## 6. Plan de adecuación (sistema + perfil) — propuesta para acordar

**Nivel sistema (ya existe, mantener):** CI corre unit + e2e + tsc + lint. Nada que crear.

**Nivel perfil (adecuar/crear):**
1. **Nuevo** `e2e/crud/maestros-datos.spec.ts`: admin abre `/admin/maestros`,
   recorre las 8 subtabs con datos del seed y crea 1 registro `TEST-*` (hoy ningún
   spec cubre maestros con datos).
2. **Nuevo** journey residente-ficha: Mis datos = p-3, reserva + certificado
   (extiende `roles-journeys` o spec propio).
3. **Nuevo** test denegación ABAC residente (`mp:propios`): con storageState
   residente, `GET` colección ajena → 403 o filtrado (según implemente el endpoint).
4. **Checklist §4** como puerta manual pre-push de cambios de authz.

Si (1)-(3) + ejecución integral exceden una ventana → **SERIE-VALIDACION-PERFILES**
(`openspec/SERIE-VALIDACION-PERFILES/`, cap 3 ventanas: P1 specs datos+matriz,
P2 journeys+ABAC, P3 integral + archivo), modo manual o delegado. No crearla sin
acuerdo del owner.

## 7. Reproducción del dataset (si la BD se recrea)

```sh
cd k0mp4ss_fe/apps/web
npm run db:push            # esquema sqlite (si BD vacía)
npm run seed:authz         # comunidades A+B + 5 TEST + membresías
npm run seed:mocks -- --comunidad-id=comunidad-a   # dataset validación (OBLIGATORIO el flag)
```

Jamás correr `seed:mocks` sin flag en una BD con `backup-a`: siembra en la
primera comunidad por creación y mezcla mocks con restaurados. El seed es
idempotente por id global: re-ejecutar para otra comunidad REUBICA filas
(no duplica); reversible re-ejecutando con el id anterior.
