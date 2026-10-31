# AM-auditoria-metricas (delta del change ad-audit-poda-gobernanza)

## MODIFIED Requirements

### Requirement: Eventos de Gobernanza (AD)
El catálogo de eventos MUST incluir `AD_DIRECTIVA_DESVINCULADA` (ficha de gobernanza depurada al guardar una persona sin el rol `directiva`), junto a los ya vigentes `AD_DIRECTIVA_SIGN_UPLOAD` (carga o reemplazo de firma) y `AD_OWNER_CONFIG_CHANGE`. Los eventos del módulo AD SHALL registrarse como inmutables con su `referenciaId` (persona o unidad afectada) y `categoria` `AD`, y alimentar las métricas de gobernanza (rotación de cargos y fichas desvinculadas). La emisión de `AD_DIRECTIVA_DESVINCULADA` SHALL ocurrir en **todos** los caminos de escritura que depuran la ficha: el store legacy `savePersona` y las rutas de API que la UI realmente usa (`POST`/`PUT /api/personas`), y SHALL corresponder a una poda **persistida** (la fila previa tenía ficha, la escrita ya no, y los roles resultantes del merge no incluyen `directiva`), incluso cuando el payload omite la clave `datosGobernanza`. El evento persistido SHALL llevar el `comunidadId` de la comunidad en scope, de modo que ninguna poda quede en silencio ni cruce comunidades.

#### Scenario: Ficha de gobernanza depurada auditada
- **WHEN** un camino de escritura (`savePersona` del store legacy o `POST`/`PUT /api/personas`) depura `datosGobernanza` de una persona cuyos roles resultantes —los del payload o, si no vienen, los de la fila persistida— ya no incluyen `directiva`
- **THEN** AM registra el evento `AD_DIRECTIVA_DESVINCULADA` con `categoria` `AD` y `referenciaId` igual al id de esa persona
- **AND** el evento queda con el `comunidadId` de la comunidad en scope

#### Scenario: Eventos de directiva como data cuantificable
- **WHEN** la reportería consulta los eventos de gobernanza
- **THEN** puede derivar la rotación de cargos de directiva a partir de `AD_DIRECTIVA_SIGN_UPLOAD` y las fichas desvinculadas a partir de `AD_DIRECTIVA_DESVINCULADA`
