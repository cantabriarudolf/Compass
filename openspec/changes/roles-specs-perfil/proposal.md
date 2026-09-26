# Proposal: roles-specs-perfil (SERIE-VALIDACION-PERFILES P2)

## Problema
La validación por perfil vive en `cuentas-funcionales.md` (§2 matriz 6 cuentas,
§4 checklist manual) y en dos specs (`roles-accesos`, `roles-journeys`), pero no
hay cobertura e2e de: (1) `/admin/maestros` con datos por admin, (2) ficha propia
del residente en Mis datos + reserva RA + certificado CT, (3) límite del
arrendatario (ve su ficha/unidad arrendada, sin finanzas), (4) denegación ABAC
`mp:propios` a nivel API. Además `e2e/auth.setup.ts` solo registra 5 cuentas:
`arrendatario@test.cl` (login rol `residente`, ficha `p-arrendatario-1`) no tiene
`storageState` ni entrada en la MATRIZ.

## Propuesta
1. Registrar `arrendatario@test.cl → e2e/.auth/arrendatario.json` en
   `e2e/auth.setup.ts` + entrada MATRIZ en `roles-accesos.spec.ts` (mismo menú
   que residente: Inicio, Operaciones, Finanzas, Comunidad).
2. Nuevos specs e2e (patrón `roles-journeys.spec.ts`, entidades `TEST-*` nuevas,
   sin confirmar retiros/pagos del seed, sin conteos frágiles):
   - `e2e/crud/maestros-datos.spec.ts`: admin recorre las 8 subtabs de
     `/admin/maestros` con datos + crea 1 registro `TEST-*`.
   - `e2e/crud/residente-ficha.spec.ts`: residente ve SU ficha p-3 en Mis datos
     + reserva RA + solicita certificado CT de su unidad.
   - `e2e/crud/arrendatario-limite.spec.ts`: arrendatario ve su ficha y su
     unidad arrendada; verifica límite (sin ver finanzas de la unidad).
   - `e2e/crud/abac-denegacion.spec.ts`: residente pide colección/persona ajena
     → 403 o filtrado según endpoint.
3. Verde: nuevos specs + lane auth completa + `tsc` + lint + `validate` del change.

## No-objetivos
- Checklist manual §4 del owner (queda para P3, tarea del owner).
- Cambios de producto en authz/sidebar/API: solo specs + setup/matriz.
- Archivo de changes (P3 integral).
