# Design: am-emisores-2

## Patrón de emisión (reusado, no reinventado)

Idéntico a `am-emisores-1` y a las 13+ rutas que ya auditan a mano. Ejemplo canónico
(`app/api/fondos-fi/[id]/retirar/route.ts`):

```ts
await prisma.eventoAuditoria.create({
  data: {
    id: generarId("ev"),
    comunidadId: scope.comunidadId,
    timestamp: new Date().toISOString(),
    usuario: scope.usuarioId,
    categoria: "IR",
    tipoAccion: "IR_ASSET_REPAIR",
    referenciaId: recurso.id,
    descripcion: "...",
  },
})
```

`EventoAuditoria` no tiene campo JSON de payload (`prisma/schema.prisma:256`): todo dato extra va en
`descripcion`, el único campo libre.

## Rutas reales (verificadas, no las candidatas del prompt)

| Evento              | Ruta real que lo emite                    | Handler previo                    |
| ------------------- | ----------------------------------------- | --------------------------------- |
| `IR_ASSET_REPAIR`   | `PUT /api/ir/recursos/[id]`               | `createPutMerge` sobre `ir/recursos` |
| `CO_DOC_DOWNLOAD`   | `GET /api/co/documentos/[id]`             | `createCrudHandlers().GET_ONE`    |
| `PE_CIERRE_EDITADO` | `PUT /api/pe/cierres-turno/[id]`          | `createPutMerge` sobre `pe/cierres-turno` |

Las tres carpetas del prompt existen; lo que no existe es un handler dedicado: las tres rutas son
envoltorios genéricos (factory / put-merge) sin punto de extensión post-escritura. `lib/api/**` está
fuera del alcance de la ventana, así que **cada `route.ts` envuelve su propio handler** y emite
después, sin tocar los helpers compartidos.

## Decisiones

1. **La auditoría nunca bloquea la operación.** Emisión post-escritura (o post-lectura en CO), en su
   propio `try/catch` con `logger.error`. Un fallo del log no cambia el status ni el cuerpo de la
   respuesta ya construida.
2. **`IR_ASSET_REPAIR` emite por transición real.** Se lee el parche desde `req.clone()` y, si trae
   `estadoActivo = "reparacion"`, se consulta el estado previo del recurso: el evento se emite solo
   cuando el activo **pasa** a Reparación desde otro estado. El re-guardado del mismo estado (el
   formulario que reenvía la fila completa) no genera ruido de auditoría. Mismo criterio que el
   "delta real" de `CF_UPDATE_PARAM` en D2.
3. **`CO_DOC_DOWNLOAD` emite en el GET de detalle.** El documento CO es metadatos + URL (D1, jamás
   base64/Blob) y no hay endpoint de descarga: el "abrir el documento" es `GET /api/co/documentos/[id]`.
   Se audita esa lectura autorizada, con nombre, tipo MIME y tamaño en la descripción. Los GET
   paginados de la colección **no** emiten (listar no es descargar).
4. **`PE_CIERRE_EDITADO` emite en cada PUT exitoso.** El cierre se crea por `POST /api/pe/cierres-turno`
   (fuera de alcance) y se edita por `PUT /api/pe/cierres-turno/[id]`: cualquier 200 de ese PUT es una
   edición de un cierre ya registrado. La descripción incluye la cantidad de entradas del historial
   resultante, que es el dato que hace auditable la edición.
5. **Errores y 401/403/404/400 no emiten** porque la emisión ocurre después del handler y solo con
   `res.ok`. Los tests lo fijan con los caminos rojos de cada ruta.
6. **Scope extra, no permisos extra.** Para armar el evento las rutas vuelven a llamar
   `withComunidadScope()` después del éxito del handler. Es la misma sesión/membresía que ya autorizó
   la operación; no se confía en nada del cliente (`comunidadId` jamás viene del body).

## Deltas de spec

**Ninguno (`skip_specs: true`).** Los tres requirements vivos ya describen la emisión como estado
vigente y el código estaba en mora:

- `IR-inventario-recursos` / "Estados del Activo y Baja Documentada" (líneas 79-84): "El paso a
  Reparación MUST auditarse como `IR_ASSET_REPAIR`", con el escenario "Reparación auditada".
- `CO-comunicacion-vecinos` / "Biblioteca de Documentos Comunales" (63-70): "cada descarga queda
  auditada como `CO_DOC_DOWNLOAD`", con el escenario "Descarga auditada".
- `PE-personal-servicios` / "Protocolo de Cierre de Turno (Reporte Obligatorio)" (90-102): "auditando
  `PE_CIERRE_TURNO` (y `PE_CIERRE_EDITADO` al editar)", con el escenario "Edición preserva
  trazabilidad".
- `AM-auditoria-metricas` no declara emisores faltantes.

No hay, por lo tanto, prosa normativa que corregir: escribir un delta acá duplicaría texto idéntico
al vivo y sólo agregaría riesgo de archive (regla 3 de `openspec/CONVENCION-DELTAS.md`).

## Verificación

`npx tsc --noEmit` 0 · `npm run lint` 0 errores · `npm test` con los pisos vigentes ·
`openspec validate --all` sin fallos · `check-delta-coverage am-emisores-2` sin problemas (change sin
specs). Cobertura sin re-baseline.
