# Retiro de `documentos_co` en producción

- **Commit de referencia**: b5724146d52877a96e53e2bef71238c4a9a585d5
  (el commit que dejó el carril `db-prod` con la guarda de ancestría y el conteo de
  filas; el retiro del código y de la tabla en dev está en `9f9c363`)
- **Secuencia**: `639573b` declaró `DocumentoCO` en el esquema de PostgreSQL como foto de
  producción, para destrabar el deploy mientras la tabla seguía allá. Este run cierra esa
  foto: el mismo commit que dispara el borrado **quita la declaración** del modelo, así que
  el diff vuelve a pedir el `DROP` y el carril tiene algo concreto que aplicar.
- **Qué se borra**: la tabla `documentos_co` completa y su foreign key
  `documentos_co_comunidadId_fkey`. Es la vieja «Biblioteca de Documentos Comunales» de
  CO: el código dejó de usarla el 2026-11-07 (reemplazada por `documentos`, el Archivo de
  Documentos), no tiene rutas, ni hook, ni schema de validación, ni consumidores.
- **Dónde quedó el respaldo**: en dev se respaldó la base completa antes de la migración
  (`Data/NSGC/backups/db-20261107T125405-pre-documentos-co/`, con `integrity_check` ok y
  conteos verificados) y la migración se ensayó con filas sintéticas. En producción **no
  se hizo un dump previo**: el carril no tiene acceso de lectura más allá del conteo de
  filas que imprime este run antes de borrar.
- **Por qué se puede perder**: el owner declaró el 2026-11-08 que los datos de producción
  son **datos de prueba** y que, si se pierde algo, se regeneran. La tabla estaba vacía en
  dev y sin consumidores desde el retiro del código.
- **Quién lo decidió**: Ricardo (owner), 2026-11-08 — «en prod hoy tenemos datos de prueba,
  no pasa nada, si perdemos algo tú simplemente creas nuevos datos de prueba».

## Ensayo

- Migración de SQLite ejecutada en dev con 0 filas reales y **4 filas sintéticas** en 2
  comunidades: la `version` se desplaza por el `MAX(version)` existente para no chocar con
  el índice único (defecto que cazó el ensayo), las 5 filas previas de `documentos` quedan
  intactas, `integrity_check: ok`, `foreign_key_check` sin filas.
- Equivalente PostgreSQL escrito y disponible en `prisma/sql-prod/2026-11-12-retira-documentos-co.sql`
  (mueve las filas y después suelta; no se usa en este run porque el owner aceptó la
  pérdida y la tabla no tiene consumidores).

## Qué espera este run

1. `migrate diff` muestra las 2 sentencias (DROP CONSTRAINT + DROP TABLE) y las marca
   destructivas.
2. Se imprime el **conteo de filas** de `documentos_co` antes de borrar.
3. Se aplica con `--accept-data-loss`.
4. La verificación posterior exige que el diff quede **vacío**; si no, el run falla.
