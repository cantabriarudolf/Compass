# Design: GD Ficha de Gobernanza editable

## Superficies
- NEW `k0mp4ss_fe/apps/web/components/comunidad/formulario-gobernanza.tsx`
- EDIT `k0mp4ss_fe/apps/web/app/comunidad/personas/[id]/page.tsx` (solo tab Gobernanza)
- EDIT `k0mp4ss_fe/apps/web/lib/store.ts` (solo `savePersona`, regla de coherencia)
- EDIT `k0mp4ss_fe/apps/web/test/store-directiva.test.ts` (nuevo `describe`)

## Decisiones
1. **Formulario separado, no dentro de `FormularioPersona`.** La ficha se carga
   después de crear la identidad (igual que la ficha laboral se carga en
   `/personas/personal`, no en el alta). Evita un modal gigante y respeta el flujo
   en dos pasos ya establecido.
2. **Coherencia en el store, no en el formulario.** `directivaVigente` se deriva
   de `datosGobernanza` en 4 lugares (quórum, firmas, reportes, UI). Poner la
   depuración en `savePersona` la hace invariante ante cualquier escritor.
3. **Sin cambio de schema ni `STORE_VERSION`.** `ExtensionGobernanzaSchema` ya
   valida cargo enum + `FechaISO` + firma D1 (solo URL). La forma persistida no
   cambia: bump innecesario.
4. **Id estable de ficha:** se conserva el existente; al crear, `g-<personaId>`.

## Componente `FormularioGobernanza`
Props espejo de `FormularioPersona`: `{ persona, ficha?, onSave, onCancel }`.
Campos: `cargoDirectiva` (Select: presidente/tesorero/secretario/director),
`fechaAsuncion` (date input, formato ISO `YYYY-MM-DD`), `firmaDigital` opcional
(URL https, nota D1: jamás base64/Blob). Validación cliente con
`ExtensionGobernanzaSchema.safeParse` para mensajes; `savePersona` revalida.
`onSave` recibe la `Persona` completa mergeada (el padre hace `savePersona` y
cierra el diálogo si `ok`).

## Perfil `[id]/page.tsx`
El tab `gobernanza` ya existe condicionado a `roles.includes("directiva")`.
Dentro: si hay `datosGobernanza` → mostrar datos + botón Editar; si no → estado
vacío + botón "Registrar ficha". Ambos abren `Dialog` con `FormularioGobernanza`.
Sin cambios al resto de tabs ni a vínculos.

## Regla `savePersona`
Después de `validarConEsquema` y antes del `upsert`:
```ts
if (!validacion.data.roles.includes("directiva") && validacion.data.datosGobernanza) {
  validacion.data = { ...validacion.data, datosGobernanza: undefined }
  registrarEvento(set, "AD_DIRECTIVA_DESVINCULADA", persona.id, `...`, "AD")
}
```
Seeds verificados: los 4 con `datosGobernanza` tienen rol `directiva`, la regla
no los toca. Caso inverso (rol sin ficha) se permite: ficha pendiente, no cuenta
para quórum — comportamiento actual preservado.

## Tests (extender `test/store-directiva.test.ts`)
Nuevo `describe("ficha de gobernanza")`:
- `savePersona` acepta ficha válida (cargo + fecha ISO).
- rechaza cargo fuera del enum.
- rechaza `firmaDigital` con `data:` (D1, por schema y por guarda previa).
- al quitar rol `directiva` con ficha existente → ficha depurada + evento
  `AD_DIRECTIVA_DESVINCULADA`.
- al conservar rol `directiva` → ficha intacta.

## Riesgos
- Bajo: `savePersona` es writer central con tests (517+ suite). La regla es
  aditiva y solo actúa en el caso fantasma.
- El evento nuevo `AD_DIRECTIVA_DESVINCULADA` sigue el patrón de los existentes
  (`AD_DIRECTIVA_SIGN_UPLOAD`).
