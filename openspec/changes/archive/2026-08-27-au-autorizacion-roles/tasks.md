## 1. Prisma Usuario/Membresia (B3)
- [x] 1.1 Añadir a `k0mp4ss_fe/apps/web/prisma/schema.prisma` modelos `Usuario` y `Membresia` con `@@unique([usuarioId, comunidadId])` + indices + relaciones a `Comunidad`/`Usuario`; `Comunidad` back-relation `membresias Membresia[]`; `prisma migrate dev --name add_usuario_membresia` limpio + `prisma generate`
- [x] 1.2 Extender `k0mp4ss_fe/apps/web/lib/repos/index.ts` para exponer `usuarios` y `membresias` (membresias scoped por comunidadId) y asegurar singleton prisma actualizado

## 2. Matriz autorización pura
- [x] 2.1 Crear `k0mp4ss_fe/apps/web/lib/authz.ts` con `ROLES`, `Rol`, `Accion`, `Recurso`, `puede(rol,accion,recurso)`, `tienePermiso(roles,accion,recurso)` mapeando RP matriz completa (admin wildcard, comite/conserjeria/residente/mantencion por FI/MP/EF/PE/PL/CT/RE/IR) y principio menor privilegio; función pura sin IO
- [x] 2.2 Añadir tests puros `k0mp4ss_fe/apps/web/lib/authz.test.ts` que verifican casos permitidos/denegados por rol (min 20 asserts, cubre wildcard admin y denegaciones conserjeria/residente en FI, etc.)

## 3. Endpoints server-side con autorización fina
- [x] 3.1 Crear `k0mp4ss_fe/apps/web/app/api/admin/usuarios/route.ts` GET protegido: verifica cookie `compass_session` via `verificarToken`, exige `?comunidadId=` o header `x-comunidad-id`, lookup `Usuario` por `sesion.sub`, verifica `Membresia` en comunidad y `puede(rol,"ver","admin:usuarios")` → 401/400/403/200 con listado scoped; nunca filtra por cliente
- [x] 3.2 Reforzar `k0mp4ss_fe/apps/web/app/api/backup/route.ts` POST: tras `isWriteApiEnabled` añadir check authz idéntico exigiendo `administrador` + `puede(rol,"ejecutar","backup")` → 403 si no, 200 si rol válido; mantener comportamiento 401/404 existente

## 4. Aislamiento A/B con repos P2
- [x] 4.1 Crear `k0mp4ss_fe/apps/web/lib/repos/repos.authz.test.ts` con DB temporal sqlite: crea 2 comunidades A/B, usuarios + membresias, verifica admin A no ve membresias/usuarios de B via `crearRepositorio` + `findMany` filtrado, y que cross-update/delete de membresia B falla
- [x] 4.2 Crear `k0mp4ss_fe/apps/web/test/api-admin-usuarios.test.ts` endpoint: mock `verificarToken` + prisma temporal, verifica 403 con rol conserjeria/residente y 200 con rol administrador para misma comunidad

## 5. Seed dev 2 comunidades
- [x] 5.1 Crear `k0mp4ss_fe/apps/web/lib/seed-authz.ts` helper `seedUsuariosMembresias(prisma)` que crea comunidades A/B + 5 usuarios TEST + membresias (admin en A+B, otros en A) idempotente
- [x] 5.2 Integrar botón/acción en `k0mp4ss_fe/apps/web/app/admin/qa-lab/page.tsx` fase AU que invoca seed y expone resultado; documenta en manual/avance que el seed crea usuarios TEST con membresías en 2 comunidades

## 6. Validación y cierre
- [x] 6.1 `cd k0mp4ss_fe/apps/web && npx tsc --noEmit && npm run lint && npm test -- --run` verde (incluidos nuevos tests authz/A-B/endpoint) + `npx prisma validate && npx prisma generate`
- [x] 6.2 `openspec validate --all` sin fallos; `prisma migrate dev` limpio y `prisma/migrations` commiteada
- [x] 6.3 Sync mains: carpeta `AU-autenticacion-sesion` nueva al archivar; `openspec/specs/project.md` actualiza nota AU de "parcial: scaffold propio" a "parcial: scaffold + B3 authz (Auth.js pendiente P5)"; `openspec archive au-autorizacion-roles --yes`
- [x] 6.4 `nsgc-prepush` (avance P4, manual de roles/usuarios, mocks de usuarios/membresías + Data Dump) → fila `SERIE-PLATAFORMA.md` HECHA + Bitácora → push
