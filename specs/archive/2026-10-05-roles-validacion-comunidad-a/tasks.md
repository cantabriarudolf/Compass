# Tasks: roles-validacion-comunidad-a

- [x] Diagnosticar: comunidad-a vacía de dominio, datos en backup-a, TEST sin membresía ahí
- [x] Confirmar diseño: spec RP + e2e validan contra comunidad-a; scope 1 comunidad; admin wildcard en permisos
- [x] Agregar script `seed:mocks` a `apps/web/package.json`
- [x] Fix bug seed: `cfg-mocks` id fijo → `cfg-mocks-<comunidadId>` (P2002 si otra comunidad ya sembrada)
- [x] Backup previo `Data/NSGC/backups/db-20260926T081328` (reversible vía `restore-db.mjs`)
- [x] Sembrar mocks en comunidad-a (flag explícito): 54 personas, 166 unidades, maestros, config
- [x] Verificar: p-3..p-7 presentes y vinculadas; 8 tipos maestro UI con datos; fondos-a 7 intactos; usuarios 69 y membresías 6 intactos; fila extra de backup-a preservada
- [ ] Commit (solo archivos del cambio; la BD dev no se commitea)
- [ ] Owner valida en UI cada perfil: admin ve todo, comite/conserjeria/residente/mantencion con alcances limitados
