# Retiro de `residenteVeMorosidad` y `alertasResidentesActivas` en producción

- **Commit de referencia**: 17bc9c4d0f0a7b0b6c3ff2f1e0b9a6e6a3a8f0d31
  (el commit que arregló `residenteVeActas` por unidad; las dos banderas muertas se
  retiraron de la superficie en `d5cc7d6`, el 2026-11-07)
- **Qué se borra**: dos columnas `BOOLEAN NOT NULL` de **dos** tablas —
  `controles_propiedad` y `controles_propiedad_archivados`. En SQLite hay que
  reconstruir las tablas (patrón RedefineTables); en PostgreSQL el carril aplica el
  equivalente. No se borra ninguna fila.
- **Dónde quedó el respaldo**: `Data/NSGC/backups/db-20261109T172748-pre-columnas/sqlite/dev.db`
  (backup con `integrity_check: ok`). Ensayo: la migración se aplicó sobre esa copia y
  sobre dev con 1 control y 0 archivados → mismas filas, integridad ok y 0 FK rotas.
- **Por qué se puede perder**: son dos booleanos que ninguna ruta leía ni escribía desde
  el 2026-11-07. El owner declaró el 2026-11-08 que los datos de producción son de
  prueba; el run del carril imprime el conteo de filas afectadas antes de aplicar.
- **Quién lo decidió**: Ricardo (owner). «A2: ok» y, sobre los datos de producción,
  «en prod hoy tenemos datos de prueba, no pasa nada».

## Ensayo

- `prisma/dev.db`: migración aplicada, las dos columnas fuera de las dos tablas, la fila
  de `controles_propiedad` conservada, `integrity_check: ok`.
- Copia del respaldo: misma migración, 1 fila antes y 1 después, 0 FK rotas.
- 199 tests focados verdes (controles, borrado lógico, vínculos, actas, permisos por
  objeto) y los que fijaban las columnas se actualizaron al contrato sin ellas.
