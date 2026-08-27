# Spec Delta: RG-reglas-generales — aviso duplicados D5 no bloqueante (TU/EF/MP)

## MODIFIED Requirements

### Requirement: Terminología Comunidad (RG §4)

El término oficial es `comunidad`; `condominio` está en desuso y SHALL NOT introducirse en ningún artefacto nuevo (spec, proposal, design, tasks, manual, código, UI).

#### Scenario: Uso de término en desuso
- **WHEN** un artefacto del change contiene `condominio`
- **THEN** debe reemplazarse por `comunidad` antes de integrar.

## ADDED Requirements

### Requirement: Aviso de duplicados por nombre/etiqueta (D5) — no bloqueante (TU/EF/MP)
El sistema SHALL advertir al guardar duplicados por `nombre`/`etiqueta` en TU (tiposUnidad.nombre), EF (macroSectores nombre/etiqueta, microSectores nombre/etiqueta) y por `nombreCompleto` en MP (personas), pero SHALL permitir el guardado si el operador confirma (D5: repetidos PERMITIDOS, aviso es confirmación no bloqueo). La detección SHALL implementarse a nivel de formulario (los formularios consultan el store vigente) y SHALL NOT cambiar la semántica del store (`saveTipoUnidad`/`saveMacroSector`/`saveMicroSector`/`savePersona` siguen aceptando repetidos). El aviso SHALL ser de tipo Advisory con opción de continuar/cancelar.

#### Scenario: TU duplicado por nombre muestra advisory y permite continuar
- **WHEN** en `/inventario/tipos` se intenta guardar un `TipoUnidad` con `nombre` que ya existe en `tiposUnidad` (comparación case-insensitive trim, excluyendo el propio `id` en edición)
- **THEN** el formulario muestra aviso "Ya existe un tipo de unidad con ese nombre. ¿Deseas continuar? (D5: repetidos permitidos)" y solicita confirmación
- **AND** si el operador confirma, `saveTipoUnidad` se ejecuta y el duplicado se persiste
- **AND** si cancela, el guardado se aborta sin mutar el store

#### Scenario: EF macro sector duplicado por nombre/etiqueta
- **WHEN** en `/inventario/estructura` se intenta guardar un `MacroSector` con `nombre` (y `etiqueta`) que ya existe en `macroSectores` (excluyendo el propio id en edición, case-insensitive trim)
- **THEN** el formulario muestra aviso advisory por duplicado de macro y pide confirmación; confirmar persiste, cancelar aborta

#### Scenario: EF micro sector duplicado por nombre/etiqueta
- **WHEN** en `/inventario/estructura` se intenta guardar un `MicroSector` con `nombre`/`etiqueta` que ya existe en `microSectores` bajo el mismo `macroSectorId` (excluyendo propio id)
- **THEN** el formulario muestra aviso advisory por duplicado de micro y pide confirmación

#### Scenario: MP duplicado por nombreCompleto
- **WHEN** en `FormularioPersona` se intenta guardar una `Persona` con `nombreCompleto` (`nombres + apellidos` trim) que ya existe en `personas` (case-insensitive, excluyendo propio `id` en edición)
- **THEN** el formulario muestra aviso "Ya existe una persona con ese nombre completo. ¿Deseas continuar? (D5)" y pide confirmación; confirmar persiste via `savePersona`, cancelar aborta

#### Scenario: Store sigue permitiendo repetidos (D5)
- **WHEN** se invoca directamente `saveTipoUnidad`/`saveMacroSector`/`saveMicroSector`/`savePersona` con un nombre duplicado desde código o test (sin pasar por el formulario)
- **THEN** la operación SHALL tener éxito (`ok:true`) y el duplicado SHALL persistir, demostrando que el aviso es solo UI y no bloqueo de dominio
