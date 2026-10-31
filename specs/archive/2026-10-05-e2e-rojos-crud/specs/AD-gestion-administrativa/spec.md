## ADDED Requirements
<!-- P2 ROJOS-CRUD: era MODIFIED sin target; el spec nunca lo tuvo -->

### Requirement: Switch de privacidad con reflejo inmediato
El switch de morosidad es controlado por la lista SWR y la revalidación
tarda segundos bajo carga dev (el assert a 600ms fallaba). SHALL aplicar
override optimista local al instante, esperar la revalidación tras el PUT y
conciliar después (igual que proyectos/reservas con `mutateGlobal`).

#### Scenario: Toggle flippea y persiste
- **WHEN** se clickea el switch y se recarga
- **THEN** `aria-checked` cambia al instante y persiste tras reload.
