## Context

Dependencias resueltas: MP/VU (unidad infractora, reportante), CO (`mensajesBuzonCO` con evidencia del vecino), GD (personas con `datosGobernanza` para respaldos de directiva), `notify()` (PI). FI no existe aún → todo cargo al Gasto Común se marca con `cargoFIReferencia:"pendiente"` (mismo patrón que GD→CV y que usará MT/RA). El catálogo se siembra con faltas NSGC típicas (ruidos molestos, mascotas sin correa, uso indebido de áreas comunes, basura fuera de horario) análogo al seed de plantillas CO.

## Goals / Non-Goals

**Goals:**
- Estandarizar cobros: sanción base monto fijo o % del Gasto Común definida en el catálogo.
- Registro operativo auditable con folio, unidad infractora, fecha/hora del suceso, antecedentes detallados y evidencias por referencia (D1).
- Cobro directo por daños (responsabilidad civil) con descripción del daño, costo exacto y respaldo documental obligatorio.
- Ciclo convivencia: reclamo CO verídico → infracción en Revisión arrastrando contexto.
- Panel directiva: comentarios internos privados + respaldo previo para multas graves.

**Non-Goals:**
- Cargo contable real al Gasto Común del periodo (FI, Ventana 6): aplicar deja `cargoFIReferencia:"pendiente"`.
- Notificación formal/notificación legal al copropietario fuera del canal simulado D3.
- Cálculo automático del % sobre el gasto común emitido (requiere emisión GC de FI): el valor % queda registrado como tal.

## Decisions

- **`tiposInfraccionIN {id, nombre, categoria leve|grave|gravisima, tipoSancion monto_fijo|porcentaje_gc, valor}`.** Seed con 5 faltas ejemplo. `removeTipoInfraccionIN` bloquea si hay infracciones registradas con ese tipo.
- **`infraccionesIN {id, folio IN-*, tipoInfraccionId? (FK catálogo), danoDirecto? {descripcionDaño, costoReparacion} — mutuamente excluyentes con tipo, unidadId (FK), reportantePersonaId?, mensajeBuzonId? (FK CO), fechaSuceso, horaSuceso, antecedentes (≥20 caracteres), evidencias[] (metadatos D1), estado en_revision|apelada|aplicada|desestimada, montoAplicado?, comentariosDirectiva[] {id, autorPersonaId, texto, fecha}, respaldosDirectiva[] (personaIds), apelacion? {descargos, fecha}, desestimacionJustificacion?, cargoFIReferencia literal "pendiente" opcional}`.**
- **Folio**: `IN-*` secuencial único por construcción (análogo BUZ/GE).
- **Estados**: en_revision inicial; `apelarInfraccionIN` (solo desde en_revision) → apelada con descargos (`IN_APELACION`); `aplicarInfraccionIN` fija montoAplicado (monto fijo del catálogo o valor % registrado) y pasa a aplicada (`IN_APPLY_FINE`) dejando `cargoFIReferencia:"pendiente"`; `desestimarInfraccionIN` exige justificación y cierra sin multa. Aplicar/desestimar disponibles desde en_revision y apelada.
- **Respaldo directiva**: para categoría grave o gravísima, `aplicarInfraccionIN` exige ≥1 persona en `respaldosDirectiva` con `datosGobernanza` vigente; `respaldarInfraccionIN` valida que el firmante sea miembro activo de la directiva. Leves no exigen respaldo.
- **Cobro directo por daños**: sin `tipoInfraccionId`; exige descripción del daño, costo de reparación > 0 y ≥1 evidencia adjunta (cotización/factura/foto) — "respaldo vital para justificar el cobro".
- **Vínculo CO**: `mensajeBuzonId` FK validada; la UI pre-carga asunto/cuerpo como antecedentes. El ciclo ciudadano sigue en CO; el operativo vive aquí (mismo doble vocabulario documentado GE).
- **Notificaciones (D3)**: al registrar, notify a administración; al aplicar, notify al propietario vigente de la unidad infractora (pasa por gate AD de alertas).
- **Rank 7**: depende de `personas`(1)+`unidades`(2)+`vinculos`(3)+`mensajesBuzonCO`(CO)+directiva(GD)+`notificaciones`(4). Seed solo catálogo.
- **Migrate v17**: agrega `tiposInfraccionIN` (con seed si ausente) e `infraccionesIN: []` aditivo.

## Risks / Trade-offs

- [Monto % sin GC real] El valor porcentual no se convierte a pesos hasta FI → aceptado: se registra el % y el cálculo quedará del lado FI al conectar.
- [Respaldo mínimo 1 directiva] La spec habla de "voto/validación" sin quórum definido → aceptado: 1 miembro basta hoy; endurecible vía catálogo/configuración futura.
- [Doble ciclo CO/IN] Reclamo ciudadano vs infracción operativa → aceptado: dominios distintos; clave de cruce = FK mensajeBuzonId.

## Migration Plan

Aditiva (catálogo sembrado + colección vacía v17). Sin transformación de datos v16.

## Open Questions

Ninguna — estados y categorías fijados por la spec NSGC de IN.
