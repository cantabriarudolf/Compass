## ADDED Requirements

### Requirement: Vista Residentes — directorio filtrado de residentes sobre MP
El sistema SHALL proveer la vista `/personas/residentes` como directorio filtrado read-only sobre las colecciones existentes `personas` y `vinculos` (MP+VU), sin duplicar edición ni mutaciones, listando exclusivamente personas que posean al menos un vínculo vigente (sin `fechaFin`) con rol `propietario` o `arrendatario` y mostrando para cada una su identidad, contacto, unidad vinculada y estado de cuenta, con enlace a la ficha en `/comunidad/personas/[id]` cuando el patrón exista.

#### Scenario: Acceso a la vista Residentes
- **WHEN** el usuario navega a `/personas/residentes`
- **THEN** el sistema muestra el heading "Residentes" y la descripción "Directorio filtrado de residentes y propietarios — vínculos vigentes con unidad."
- **AND** renderiza la tabla/grilla con las personas filtradas (solo vínculos vigentes propietario/arrendatario).

#### Scenario: Filtro por vínculo vigente
- **WHEN** la vista carga datos de `vinculos` y `personas`
- **THEN** el listado SHALL incluir solo personas donde `vinculos.some(v => v.personaId === persona.id && !v.fechaFin && (v.rol === "propietario" || v.rol === "arrendatario"))`
- **AND** SHALL excluir personas con solo roles `copropietario`/`ocupante`, sin vínculos, o con vínculos cerrados (`fechaFin` definida).

#### Scenario: Unidad vinculada y estado visibles
- **WHEN** una persona con vínculo vigente se renderiza
- **THEN** la fila muestra la etiqueta de unidad (`unidades.find(u.id === vinculo.unidadId)`) y el rol del vínculo
- **AND** muestra `estadoCuenta` (badge) y contacto (`telefonoMovil`/`email`).

#### Scenario: Link a ficha MP y read-only
- **WHEN** el usuario ve una fila de residente
- **THEN** la fila ofrece un link "Ver Ficha" hacia `/comunidad/personas/{persona.id}`
- **AND** la vista no ofrece acciones de creación/edición/borrado de personas o vínculos (solo lectura; la edición vive en `/comunidad/personas`).

#### Scenario: Skeleton durante hidratación
- **WHEN** `hasHydrated === false`
- **THEN** la vista muestra skeleton (`animate-pulse`) en lugar de la tabla.

#### Scenario: Navegación lateral habilitada
- **WHEN** la vista existe
- **THEN** `/personas/residentes` ya no pertenece a `RUTAS_PENDIENTES` en `AppSidebar` y el item "Residentes" es navegable sin badge "Próximamente".
