## ADDED Requirements

### Requirement: Sin TDZ en el formulario de proveedores
`app/operaciones/proveedores/page.tsx` SHALL declarar `editandoProvId`
(useState) ANTES de `rutProvDuplicado`: el `.some()` de duplicados lo
referencia y con lista no-vacía + RUT tipeado lanzaba ReferenceError
(crash de la página; latente con lista vacía porque `.some()` no ejecuta
el callback). Test de regresión: e2e `proveedores` (llena RUT con datos).

#### Scenario: Llenar RUT con proveedores existentes no crashea
- **WHEN** se abre "Nuevo proveedor" y se tipea un RUT con la lista no-vacía
- **THEN** no hay pageerror, el formulario sigue visible y el guardado
  funciona (e2e en verde).
