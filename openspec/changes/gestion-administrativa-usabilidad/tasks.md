# Tasks: gestion-administrativa-usabilidad

## T1 — Estructura de datos derivada (sin cambio de semántica)

- [ ] 1.1 Índice `personaId → vinculos[]` en un solo recorrido, memoizado.
- [ ] 1.2 Mapa `personaId → Set<RolDirectorio>` con **los predicados idénticos** a los actuales
      (`propietario`: `p.roles.includes("propietario") || algún vínculo rol propietario`, sin filtro
      de `fechaFin`, como hoy; `residente`: arrendatario vigente o `roles` residente sin propietario;
      `directiva`: `datosGobernanza != null`; `personal`: `datosLaborales != null`).
- [ ] 1.3 Índice inverso `unidadId → { propietario?, residente? }` vigentes, para la matriz.

## T2 — Directorio

- [ ] 2.1 `usePersonas(q)` con `q` debounced (250 ms); el buscador va al servidor.
- [ ] 2.2 Chips de rol multi-selección con contador por rol, más «Limpiar» cuando hay filtro.
- [ ] 2.3 Tabla: Persona (foto, nombre, RUT) · Contacto · Roles · Unidades · acción «Ver ficha».
- [ ] 2.4 Estado vacío distinto para «sin resultados de búsqueda» y «sin personas».
- [ ] 2.5 `AvisoTruncamiento` con `mostrados={personas.length}` y `total={total}`.

## T3 — Matriz de privacidad por unidad

- [ ] 3.1 Una fila por unidad: etiqueta, propietario vigente, tres switches, origen.
- [ ] 3.2 Filtro de texto por unidad o propietario; filtro «solo con configuración explícita».
- [ ] 3.3 `actualizarControl` conserva el upsert y los defaults `false/false/true`, y la
      revalidación esperada antes de soltar el override optimista.
- [ ] 3.4 Estado por fila: `guardando` deshabilita los tres switches; el error se pinta en una fila
      de detalle debajo, con `role="alert"`.
- [ ] 3.5 `AvisoTruncamiento` con `items.length` / `total` de `useUnidades()`.

## T4 — Ficha en panel lateral

- [ ] 4.1 `Sheet` con foto, nombre, RUT, teléfono, email, roles y unidades.
- [ ] 4.2 Bloque de gobernanza con cargo, fecha de asunción y **preview de la imagen** de firma.
- [ ] 4.3 Edición de firma inline en la ficha (sin diálogo anidado sobre el `Sheet`), con la misma
      llamada `updatePersona(id, { datosGobernanza })` y `ExtensionGobernanza`.
- [ ] 4.4 Bloque laboral con cargo, AFP, previsión y fecha de ingreso.

## T5 — Cierre

- [ ] 5.1 `pnpm typecheck` (o `tsc --noEmit`) sin errores nuevos.
- [ ] 5.2 `pnpm lint` sin errores nuevos en el archivo tocado.
- [ ] 5.3 Suite de tests existente en verde; se documenta que no hay test que cubra el render de
      esta página y por qué.
- [ ] 5.4 `pnpm build` en verde.
- [ ] 5.5 Verificación independiente del diff (riesgo alto: superficie de permisos + sin test de
      regresión visual).
- [ ] 5.6 Registrar la evidencia en `openspec/BACKLOG-100.md` y en `openspec/PENDIENTES-FUNCIONALIDAD.md`
      si queda algo abierto.
