## MODIFIED Requirements

### Requirement: Tab de bitácora controlado (sobrevive al skeleton)
`app/operaciones/bitacora/page.tsx` SHALL usar `<Tabs value>` controlado
con estado en la página: el skeleton antepuesto a `cargandoAPI` desmonta el
árbol y un Tabs no-controlado pierde la selección en cada revalidación
tardía (el usuario vuelve a "Reporte Diario" sin aviso). El estado vive en
la página, que no se desmonta, y sobrevive a los swaps del skeleton.

#### Scenario: El tab sobrevive a una revalidación tardía
- **WHEN** el usuario está en "Visitas" y una query revalida (skeleton
  intermedio)
- **THEN** al volver el contenido sigue seleccionado "Visitas" (e2e
  `roles-journeys` conserjería).
