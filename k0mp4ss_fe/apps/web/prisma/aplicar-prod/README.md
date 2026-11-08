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
