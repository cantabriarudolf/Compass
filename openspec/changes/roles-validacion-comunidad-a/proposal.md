# Proposal: roles-validacion-comunidad-a

## Contexto

Las 5 cuentas TEST (`admin/comite/conserjeria/residente/mantencion@test.cl`,
password `Test1234!`, creadas por `scripts/seed-authz.mjs`) existen para
validar las vistas por rol. Pero en la BD dev actual la comunidad de esos
usuarios (`comunidad-a`, la del diseño e2e `?comunidadId=comunidad-a`) está
vacía de dominio: 0 personas, 0 unidades, 0 maestros. Todos los datos reales
(maestros 100, personas 55, unidades 166) están en `comunidad-backup-a`
(restauración), donde los TEST no tienen membresía. Resultado: los perfiles
ven tablas vacías y los alcances limitados (ABAC `mp:propios`, ficha del
residente vía `personaId` p-3..p-7) no se pueden validar.

## Objetivo

Poblar `comunidad-a` con el dataset de validación (mocks deterministas) de
forma reproducible, sin tocar `comunidad-backup-a` ni los fondos existentes,
para que los 5 perfiles + admin validen sus vistas y alcances.

## Alcance

1. Correr `scripts/seed-db-from-mocks.ts` con `--comunidad-id=comunidad-a`
   explícito (EF, MP con p-1..p-55 incl. p-3..p-7 vinculadas a los TEST,
   config, MA completo, tipos IN).
2. Agregar script npm `seed:mocks` (reproducible en CI/local).
3. Verificar conteos por comunidad + vistas por rol a nivel datos.

## No-alcance

- Cambiar el modelo de scope (`withComunidadScope`, una comunidad por request)
  ni el RBAC/ABAC (`puede`/`puedeContextual` ya dan wildcard a administrador).
- Copiar ni mover datos de `comunidad-backup-a`; no tocar fondos de
  `comunidad-a` (punto cero intacto).
- Journeys e2e (CI los cubre con datos que crean ellos mismos).
