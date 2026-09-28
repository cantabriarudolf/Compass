## MODIFIED Requirements

### Requirement: Columna RUT de la comunidad con nombre canónico
La columna Prisma SHALL llamarse `rutComunidad` (terminología RG §4), no
`rutCondominio` (legacy). La migración SHALL preservar los valores. El GET
SHALL exponer `rutComunidad` con valor, de modo que el input required del
form no quede vacío y el submit nativo no se bloquee. Los defaults de
creación del PUT SHALL ser válidos según schema (una fila creada por PUT
parcial mínimo puede reenviarse completa sin 400).

#### Scenario: Guardar nombre persiste y se refleja
- **WHEN** se edita el nombre en `/admin/configuracion` y se guarda
- **THEN** el PUT responde 200 y al re-navegar el input muestra el nombre nuevo.

#### Scenario: PUT de objeto completo estilo Prisma
- **WHEN** se envía el objeto completo del GET (con `rutComunidad` + nulls
  en opcionales)
- **THEN** el PUT responde 200 (test `api-configuracion.test.ts`).
