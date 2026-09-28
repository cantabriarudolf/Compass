## ADDED Requirements

### Requirement: GATED declarados PARCIAL (causa estructural QA-Lab)
Los 4 specs GATED (`certificados`, `pagos`, `portal`, `remuneraciones`)
SHALL quedar PARCIAL para P4/owner: el QA-Lab "Poblar todo de una vez"
escribe al store legacy (`useCompassStore.save*`) mientras las páginas
migradas leen BD — el poblado nunca deja `TEST Persona QA Uno` ni fixtures
en BD y los specs no encuentran combos/datos. Migrar el QA-Lab a BD (o un
seed BD de fixtures GATED) excede el fix pequeño P2.

#### Scenario: Clasificación sin agrandar
- **WHEN** se corre cada GATED tras reseed limpio
- **THEN** falla por datos TEST ausentes en BD (no por regresión P2) y se
  hereda a P4 con esta causa y la propuesta (seed BD GATED o QA-Lab a BD).
