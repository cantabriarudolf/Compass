# Design: am-emisores-1

## Patrón de emisión (reusado, no reinventado)

Las 13 rutas que ya auditan crean el evento a mano. Ejemplo canónico
(`app/api/fondos-fi/[id]/retirar/route.ts`):

```ts
await prisma.eventoAuditoria.create({
  data: {
    id: generarId("ev"),
    comunidadId: scope.comunidadId,
    timestamp: new Date().toISOString(),
    usuario: scope.usuarioId,
    categoria: "FI",
    tipoAccion: "FI_FUND_WITHDRAWN",
    referenciaId: egreso.id,
    descripcion: "...",
  },
})
```

`EventoAuditoria` no tiene campo JSON de payload (`prisma/schema.sqlite.prisma:261`), así que el
old/new de `CF_UPDATE_PARAM` viaja en `descripcion` (único campo libre del evento), junto con
`referenciaId` = id de la fila de configuración.

## Decisiones

1. **La auditoría nunca bloquea la mutación.** La emisión va después de la escritura, en su propio
   `try/catch` con `logger.error`. Es el patrón vigente en `app/api/personas`
   (`auditarPodaGobernanza`) y `app/api/mis-datos`: un fallo del log de auditoría no debe convertir
   en 500 una escritura ya persistida. Difieren las rutas que emiten **dentro de una transacción**
   (RA/IN), que no es el caso aquí.
2. **`CF_UPDATE_PARAM` emite por delta real, no por request.** Se comparan los cuatro parámetros
   legales presentes en el payload contra el valor anterior (`null` si la fila no existía o el campo
   venía `null` con el schema `nullable().optional()`). Un `PUT` que no toca los cuatro campos —o que
   los reenvía con el mismo valor, como hace el formulario cuando manda la fila completa— **no**
   emite. Sin esta regla, cada guardado de cualquier campo de CF generaría ruido de auditoría.
3. **Old/new sin secretos.** La descripción solo incluye los cuatro parámetros legales (números
   públicos: UF, IMM, factor de gratificación, tasa SIS). `smtpPassword` y `claveEliminacionMaestro`
   quedan fuera por diseño del requirement `CF-configuracion-global` (nunca se auditan ni se
   persisten desde el PUT).
4. **FI y GD emiten en cada POST exitoso**, incluido el rail "update" del upsert por id: el evento
   registra la escritura, no la fila resultante. El `PUT` parcial de `[id]/route.ts` queda sin
   auditar (fuera del alcance de esta ventana; la spec nombra el POST).
5. **Errores y 403/400 no emiten** porque la emisión ocurre después de todas las guardias (scope,
   permiso, validación de fondo activo / nómina) y después de la escritura. Los tests lo fijan.

## Deltas de spec

- `ST-capa-datos-persistente` / "Auditoría CF_UPDATE_PARAM de parámetros legales": se reescribe la
  prosa que declaraba el gap (la ruta "no lo emite") y se agrega el escenario de no-emisión sin
  cambio real. El escenario existente "Cambio de UF mensual auditado" viaja con el mismo nombre.
- `CF-configuracion-global` / "Persistencia y Auditoría": se retira la prosa del gap; los escenarios
  "Save Configuration" y "Audit Event" se conservan literalmente.
- `CF-configuracion-global` / "Parámetros Legales Chile para Remuneraciones (implementación)": el
  escenario "Edición desde Parámetros Legales" pasa de "queda pendiente server-side" a "el PUT emite
  el evento con old/new"; "Rango inválido rechazado" se conserva.
- **Sin delta**: `FI-finanzas-morosidad` y `GD-gestion-directiva` ya describen el POST con su evento
  como estado vigente; esta ventana pone el código a la altura de esas specs (no cambia el contrato).
- **Sin delta**: `AM-auditoria-metricas` (no declara emisores faltantes).

## Verificación

`npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage am-emisores-1` 0 que romperían el
archive. Cobertura sin re-baseline (si sube, se anota; los pisos no se tocan en esta ventana).
