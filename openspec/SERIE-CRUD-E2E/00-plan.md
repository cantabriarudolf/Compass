# Serie CRUD-E2E — Plan y Estado Canónico

> Toda ventana DEBE leer este archivo al iniciar (bloque ARRANQUE), marcar su fila EN CURSO
> y actualizarla antes del push final. La Bitácora es el registro durable de la serie.

**Objetivo:** cubrir el **CRUD interactivo real de los 16 módulos** con specs Playwright
(`e2e/crud/<modulo>.spec.ts`) que simulan el flujo natural de un usuario: abrir módulo →
crear entidad por su UI real → verificar que aparece en la lista → acción secundaria →
0 excepciones JS. Con esto, la skill `pruebas` (v2, con comando `/qa`) ofrece el abanico
completo: suite, smoke, auth, journey y CRUD por módulo, en headless o en vivo.

**Alcance técnico:** SOLO specs E2E nuevas en `k0mp4ss_fe/apps/web/e2e/crud/` + skill
`pruebas` v2 (`.opencode/skills/pruebas/SKILL.md`) + comando `/qa`
(`.opencode/command/qa.md`). **Sin cambios de app ni de `lib/store.ts`** (infraestructura
de verificación — igual que el lane e2e del avance 2026-08-29, puede ir sin change
openspec; documéntalo así en la Bitácora). Sin bump de STORE_VERSION.

**MÁXIMO: 6 ventanas.** Post-serie (queda fuera): e2e en CI del lane crud completo si el
tiempo de runner lo exige, POM refactor masivo, rate-limit.

**Base de hechos (inventario de UI verificado en el código 2026-08-29):**
- Etiquetas exactas de botones/forms/listas: están en cada prompt y provienen de la
  lectura del código de las páginas (`app/**/page.tsx`) hecha por el orquestador.
- Fixture: el store parte SIEMPRE con seed (54 personas, 166 unidades, vínculos, maestros)
  en cada contexto de test (localStorage aislado por test). Los módulos gated usan el QA
  Lab como precondición: `/admin/qa-lab` → "Poblar todo de una vez" → esperar
  `page.getByText("🟢 Listo").first()` (NO el mensaje de carga: hoy puede decir
  "Carga con 27 errores" y aun así los datos core se crean — tras la Serie QA-LAB dirá
  "Carga completa OK").

## Quirúrgicos obligatorios (aprender de `e2e/flujo/` y del avance 2026-08-29 11-10)

1. Botones pesados o dentro de ScrollArea de dialog: click con
   `{ force: true, noWaitAfter: true }`; si el submit del diálogo queda fuera de viewport,
   enviar el form vía `page.locator('[role="dialog"] form').evaluate(f => f.requestSubmit())`.
2. Strict mode: scoper los locators (p. ej. `page.locator("form").getByRole("alert")`).
3. `alert()` nativo (configuracion): registrar `page.on("dialog", d => d.accept())` antes.
4. Descargas (certificados/reportes): si el botón dispara download, envolver con
   `page.waitForEvent("download")` o solo afirmar el registro en el historial.
5. Timeout turbopack: la config de `playwright.config.ts` ya lo cubre; no ajustar.
6. Cada spec afirma al final: `expect(errores).toEqual([])` sobre `page.on("pageerror")`.

## Mapa módulo → spec (16 CRUD + 1 existente)

| Ruta | Spec | Acción principal (real) | Afirmación |
|---|---|---|---|
| /admin/maestros | crud/admin-maestros | sub-tab → "Nuevo Registro" → Dialog → "Guardar" | fila en Table del sub-tab |
| /admin/configuracion | crud/admin-configuracion | form inline → "Guardar Cambios" (alert nativo) | valores persisten |
| /admin/reporteria | crud/admin-reporteria | "Generar reporte (snapshot)" → "Distribuir" | card en "Historial de reportes" |
| /personas/personal | crud/personal | card → "Crear ficha" → Dialog → "Guardar ficha" | ficha visible en la card |
| /inventario/tipos | crud/tipos | "Nuevo Tipo" → "Actualizar Tarifario" | fila en "Plantillas Técnicas" |
| /inventario/estructura | crud/estructura | "Nueva Unidad" → "Registrar Unidad" | fila con el número en Table |
| /inventario/recursos | crud/recursos | "Nuevo recurso" → "Guardar" | fila en catálogo |
| /inventario/proyectos | crud/proyectos | "Nuevo trabajo" → "Guardar" → "Iniciar" | fila con estado en_curso |
| /operaciones/reservas | crud/reservas | "Nuevo elemento reservable" + "Nueva reserva" → "Confirmar disponibilidad y reservar" | fila en calendario |
| /operaciones/solicitudes | crud/solicitudes | "Enviar Solicitud" | fila en bandeja + "En Revisión" |
| /operaciones/bitacora | crud/bitacora | "Registrar visita" → "Marcar Ingresada" | fila con estado ingresada |
| /operaciones/proveedores | crud/proveedores | "Nuevo" → Dialog → "Guardar" | fila en catálogo |
| /finanzas/gastos-comunes | crud/gastos-comunes | "Nuevo Fondo" + "Registrar Gasto" | Card de fondo + fila de egreso |
| /finanzas/multas | crud/multas | "Registrar infracción" → "Registrar" | fila en registro |
| /finanzas/pagos | crud/pagos (gated: poblar) | "Registrar pago" → "Procesar pago" | estado del cobro cambia |
| /comunidad/comunicacion | crud/comunicacion | "Nueva plantilla" → "Guardar" | card de plantilla |
| /comunidad/directiva | crud/directiva | "Registrar reunión / nueva acta" → "Guardar borrador" | card borrador + botones "Aprobar como" |
| /comunidad/visor | crud/visor | "Nuevo aviso" → "Publicar" → verificar en /visor-mensajes | título en el visor público |
| /admin/gestion | crud/gestion | switches privacidad (aria-label) + "Cargar firma" | estado del switch persiste |
| /comunidad/certificados | crud/certificados (gated: poblar) | selects → "Generar certificado PDF firmado" | fila en Historial |
| /finanzas/remuneraciones | crud/remuneraciones (gated: poblar) | "Guardar cambios" params → "Generar liquidación (borrador)" | fila en historial |
| /comunidad/portal | crud/portal (gated: poblar) | "Nueva publicación manual" → Guardar | card en catálogo/gestión |
| /comunidad/personas | ✅ ya existe (e2e/flujo/personas.spec.ts) | — | — |

Read-only puros (ya cubiertos por smoke/journey): /admin/metricas, /visor-mensajes,
"Reporte Diario" de bitácora, "Centro de Mando" de reporteria.
NO ESCRIBIR: /inventario/estacionamientos (route sin página — 404).

## Roadmap

| Ventana | Alcance | Estado | Commit final |
|---|---|---|---|
| P1 | Batch Admin/Personas (maestros, configuracion, reporteria, personal). *Skill `pruebas` v2 + `/qa` ya materializadas por el orquestador en el setup — P1 las verifica y ajusta solo si difieren* | HECHA | 18f06e0 |
| P2 | Batch Inventario (tipos, estructura, recursos, proyectos) | HECHA | — |
| P3 | Batch Operaciones (reservas, solicitudes, bitacora, proveedores) | pendiente | — |
| P4 | Batch Comunidad (comunicacion, directiva, visor+visor-mensajes, gestion) | pendiente | — |
| P5 | Batch Finanzas (gastos-comunes, multas, pagos gated) | pendiente | — |
| P6 | Complejas gated (certificados, remuneraciones, portal) + cierre integral (suite completa verde + avance + SERIE COMPLETA) | pendiente | — |

## Bitácora

- [2026-08-30] P1 HECHA: lane crud Batch Admin/Personas — 4 specs (maestros, configuracion, reporteria, personal) verdes; infraestructura de verificación sin change openspec ni bump STORE_VERSION (26). Skill pruebas v2 y /qa verificadas (existían y mapa coincide con 00-plan, sin ajustes). Desviaciones: maestros usa input name=nombre y requiere .first() por badge duplicado; configuracion/reporteria usan placeholders sin htmlFor (textbox vecino/placeholder); reporteria requiere perfil "Propietarios" para resolver destinatarios; personal dialog no autocierra tras guardar (cerrado manual) y requiere label→combobox vecino. (18f06e0)
- [2026-08-31] P2 HECHA: lane crud Batch Inventario — 4 specs (tipos, estructura, recursos, proyectos) verdes; infraestructura de verificación sin change openspec ni bump STORE_VERSION (26). Desviaciones: tipos misma etiqueta "Actualizar Tarifario" para crear/editar, inputs con name=nombre/metraje/montoBaseGc sin htmlFor y monto controlado por estado (fill directo) + Select categoría por label→combobox vecino y submit fuera de viewport → requestSubmit; estructura requiere picks de Macro-Sector/Sub-Sector/Categoría Física vía label→combobox y QA-9999 único, botón Registrar deshabilitado hasta picks; recursos Naturaleza insumo por defecto pero se fuerza pick "Insumo / Consumible", checkbox stock crítico habilita umbral, Nombre via placeholder + label vecino, stock/umbral via label vecino/placeholder; proyectos usa placeholders para título/proveedor, textarea descripción min 20 chars, unidad EF pick primera real (skip Ninguna) y responsable via proveedor externo, transición Iniciar→En Curso. (—)
