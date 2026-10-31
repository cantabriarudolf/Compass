## ADDED Requirements

### Requirement: Poda de nulls de BD antes de enviar (sinNulos)
Las páginas que reenvían filas Prisma SHALL podar nulls de primer nivel
antes del POST/PUT (helper `sinNulos` en `use-crud-collection`; misma
semántica que put-merge: null de BD = ausente). La ficha de personal SHALL
usarlo: el POST con `telefonoFijo`/`fotografiaUrl`/`datosGobernanza`/
`permiteCreacionManualCV` en null daba 400.

#### Scenario: Guardar ficha integral persiste
- **WHEN** se edita cargo/fecha/FKs en `/personas/personal` y se guarda
- **THEN** el POST responde 200 y aparece "Ficha de … guardada".
