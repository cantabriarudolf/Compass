# Tasks — `st-fuente-verdad-bd`

## 1. Deltas

- [x] 1.1 `RG-reglas-generales`: requirement «Capa de datos persistente (ST)» reescrito con sus tres escenarios intactos (nombres exactos).
- [x] 1.2 `ST-capa-datos-persistente`: «Persistencia entre recargas», «Versionado y migración del almacenamiento» y «Sembrado inicial desde mocks» reescritos con sus escenarios intactos.

## 2. Documento transversal

- [x] 2.1 `openspec/specs/project.md`: viñeta «Data layer (ST)» de Development Conventions alineada con la BD como fuente de verdad.

## 3. Gates

- [x] 3.1 `node openspec/scripts/check-delta-coverage.mjs st-fuente-verdad-bd` sale 0.
- [ ] 3.2 `openspec validate st-fuente-verdad-bd --strict`: **no ejecutable** — el CLI `openspec` no está instalado en esta máquina. El gate real de formato es `check-delta-coverage.mjs`, que sale 0.

## 4. Cierre

- [ ] 4.1 Archivar el change (`openspec archive st-fuente-verdad-bd -y`) tras CI verde.
- [x] 4.2 Retirar del `AGENTS.md` la regla de bump de `STORE_VERSION` (F22 / retiro del store legacy): fuera de este change, va con el retiro del módulo dev.
