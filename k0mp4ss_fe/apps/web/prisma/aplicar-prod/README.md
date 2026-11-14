# Intenciones de cambio destructivo en producción

Un archivo por operación. Se commitea **en el mismo commit** que se va a aplicar, y el
run del carril `db-prod` (`.github/workflows/db-prod.yml`) lo lee antes de tocar la base.

## Cuándo hace falta

Sólo para el modo `aplicar-destructivo`, o sea cuando el diff entre el esquema y la base
real trae `DROP TABLE`, `DROP COLUMN`, un cambio de tipo de columna, `TRUNCATE` o un
`DELETE`. Los modos `diagnostico` y `aplicar` no piden nada.

## Formato

El nombre es `<AAAA-MM-DD>-<motivo-corto>.md`. El contenido tiene que nombrar **el SHA
completo** del commit que se aplica —el carril aborta si no coincide— y responder cuatro
cosas:

```markdown
# Retiro de <la tabla o columna>

- **Commit**: <sha completo de 40 caracteres>
- **Qué se borra**: <tabla/columna, y si tiene filas, cuántas y de qué tipo>
- **Dónde quedó el respaldo**: <ruta del dump o rama de Neon>
- **Por qué se puede perder**: <datos de prueba, tabla sin consumidores, etc.>
- **Quién lo decidió**: <persona y fecha>

## Ensayo

<qué se probó antes y sobre qué base>
```

Sin esas cuatro respuestas el archivo no es una intención, es un permiso firmado en
blanco. Si el borrado no se puede justificar así, no se hace.

## Ejemplo real

`2026-11-12-retira-documentos-co.md` — la tabla de la vieja biblioteca de CO, retirada del
código el 2026-11-07 y pendiente de borrar en producción. Su versión PostgreSQL está en
`prisma/sql-prod/2026-11-12-retira-documentos-co.sql`.

## El otro carril: `aplicar-sql`

`prisma/sql-prod/` guarda los SQL de una sola pasada —backfills, correcciones de datos—
que el diff del esquema no puede expresar: el diff crea la columna, no la llena. El modo
`aplicar-sql` del carril `db-prod` corre **un** archivo de ese directorio, y sólo eso: no
toma SQL de un campo de texto, así que nunca es SQL libre.

Se niega, siempre **antes** de abrir la conexión, cuando:

- la ruta no empieza con `k0mp4ss_fe/apps/web/prisma/sql-prod/`, o trae un segmento `..`;
- el archivo no está commiteado en el commit que se aplica;
- al archivo le falta en el header `-- verificar: SELECT ...` o `-- esperado: <valor>`;
- el SQL trae `DROP`, `DELETE`, `TRUNCATE`, `ALTER` o `GRANT` fuera de comentarios: eso es
  de `aplicar-destructivo`, con su intención.

El header es lo que distingue un backfill de un `UPDATE` a ciegas — las dos líneas se
leen antes de ejecutar, la verificación corre antes (se imprime) y después (tiene que dar
el valor declarado o el job falla), y el run informa las filas que tocó el `UPDATE`:

```sql
-- verificar: SELECT count(*) FROM "acuerdos_votos" WHERE "unidadId" IS NOT NULL AND "claveUnidad" IS NULL;
-- esperado: 0
```

**El commit se exige igual que en la intención**: el archivo tiene que estar en el commit
que se aplica o en un ancestro suyo. Uno que sólo está en el árbol de trabajo no corre
—se ejecuta el contenido del commit, no el del editor—, y el run lo avisa si difieren.
