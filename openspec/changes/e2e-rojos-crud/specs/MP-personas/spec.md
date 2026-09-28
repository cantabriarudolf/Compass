## MODIFIED Requirements

### Requirement: Validación de referencias tolerante a null de BD
`esReferenciaValida` SHALL tratar null como ausente: las filas Prisma traen
`fotografiaUrl: null` y el PUT de firma reventaba con TypeError (500, dialog
de gestión que no cierra).

#### Scenario: Guardar firma digitalizada persiste
- **WHEN** se carga una URL de firma en `/admin/gestion` tab Directiva
- **THEN** el PUT responde 200, el dialog cierra y la URL aparece en la card
  (test de regresión en `personas.test.ts`).
