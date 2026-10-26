# PENDIENTES-FUNCIONALIDAD — qué debe existir y todavía no está

> **Qué es este archivo**: el registro de funcionalidades que el sistema **necesita** y hoy no tiene,
> detectadas al migrar, al auditar o al decidir. No es una lista de ideas: cada fila es algo que
> **falta de verdad** y que alguien puede tomar y desarrollar.
>
> **Regla**: si algo "debe existir" y no existe, se anota acá el mismo día. Nunca se deja solo en un
> chat. Cuando se implementa, se mueve a la sección **Hecho** con su commit y su test.
>
> **Relacionado**: `openspec/BACKLOG-100.md` (deuda técnica y decisiones de producción/owner) ·
> `openspec/changes/` (changes en curso) · `.agents/skills/auditoria-contratos-permisos/references/`
> (antipatrones y hallazgos de permisos).

## Abiertos

| # | Qué debe existir | Por qué falta | Estado | Desbloquea |
| --- | --- | --- | --- | --- |
| F4 | **Emisor SMTP real** | `CF` ya tiene los campos (`smtpHost`, `smtpPort`, `smtpUser`, `smtpSecurity`, `smtpFrom`…) pero **no existe emisor**: 0 referencias a `nodemailer`/`sendMail`. Todo correo queda en outbox `pendiente` | Bloqueado | **Owner**: credenciales SMTP |
| F6 | **Selector de unidad/persona con búsqueda total** | **Unidad destino y residente destino ya buscan en el servidor, y la cédula se resuelve contra el padrón real** (rama `feat/f6-unidad-destino-buscable`): `components/selector-buscable.tsx` en `visitas-panel.tsx` contra `GET /api/pe/unidades?q=`, una proyección de solo lectura con `pe:bitacora` — `/api/unidades` está detrás de `mp` y **devolvía 403 a conserjería**, el rol que registra la visita (hallazgo H9). De paso se corrigió que el filtro de destinos escondía los 16 departamentos de la torre E: el estacionamiento se descarta por **etiqueta**, no por el prefijo `u-E-` que ambos comparten. **Falta** (2026-10-25, ventana `pe-paneles-bd`): la bitácora ya persiste en la base y las etiquetas se resuelven contra la proyección de operación (`/api/pe/unidades` y `/api/pe/personas` con `pageSize=100`), así que sobreviven a la recarga; con **más de 100 unidades o personas, la que cae fuera de la primera página sigue mostrando el id crudo** en la tabla del día, y ese rótulo no tiene búsqueda | **Cableado, falta el rótulo fuera de la primera página** | Nadie: rótulo por `?rut=`/`?q=` en la fila |
| F7 | **Lectura de la cédula anterior (PDF417 / MRZ)** | El escáner QR (PR #9) solo funciona con la cédula **nueva**. La anterior no tiene QR: su PDF417 es formato propietario del Registro Civil y el MRZ por OCR es frágil. Hoy esas visitas se cargan a mano | Fuera de alcance declarado | **Owner**: si se necesita, requiere evaluación técnica aparte |
| F8 | **Verificación de autenticidad de documentos de identidad** | El escáner **identifica** al portador (RUT + DV módulo 11) pero **no certifica que el carnet sea auténtico**. **Asesoría 2026-10-25**: ni la Ley 21.442 ni su reglamento (D.S. 7, 09-01-2025) exigen esa verificación —la identidad se verifica para las **consultas escritas**, y el registro de visitas es una medida de seguridad que se ampara en el reglamento interno o acuerdo de asamblea—. Certificar autenticidad es **mitigación opcional (criterio del proyecto)** y seguiría exigiendo SDK comercial (Regula, BlinkID) | Decidido: **no es obligación legal** | **Owner**: sólo si quiere pagar el SDK |
| F9 | **Retiro/aislamiento del módulo QA/dev antes de producción** | `admin/qa-lab`, `admin/dev-dashboard` y `admin/mantenimiento` operan sobre `localStorage` y **cualquier usuario autenticado puede acceder**. No migran: se retiran o se aíslan | Decidido, sin ejecutar | **Owner**: cuándo |
| F10 | **Allowlist de dominios para abrir documentos** | El `window.open` de documentos ya valida destino (PR #11) con una lista: origen propio + `supabase.co`/`supabase.in`. Si se suma otro proveedor de archivos, hay que agregarlo o los documentos no abren | Funcional con el default | **Owner**: qué dominios sumar |
| F14 | **Aviso de privacidad en conserjería** | El visitante es un **tercero** cuyo nombre, RUN y hora quedan registrados y hoy no se le informa nada. La 19.628 (art. 4, «debidamente informada») y el deber de transparencia de la 21.719 piden aviso visible: qué se registra, finalidad (seguridad), responsable (la comunidad), plazo de conservación y contacto ARCO | Sin empezar | Nadie: texto + cartel en `/operaciones/*` |
| F15 | **Retención y baja protegida de la bitácora** | **Criterio del owner (2026-10-25): la bitácora es un registro y no se limpia** — pesa poco en la base y da trazabilidad. La asesoría no encontró plazo legal de conservación verificado, así que el plazo es criterio del proyecto. **Hecho**: la baja dejó de depender de que la UI esconda el botón — `beforeDelete` en las tres rutas `[id]` responde 409 con el mensaje del store para visita **ingresada**, encomienda **retirada** y contratista **ingresado** (`test/api/pe-baja-auditable.test.ts`, 6 casos; agendada/recibida sí se borran). **Falta**: anonimización del visitante a los N años (recomendado **5**, el precedente interno de retención de logs de auditoría) conservando fecha, unidad, jornada, estado y hora —el registro queda, el tercero deja de estar identificado— y la política escrita | **Parcial**: baja protegida hecha, falta la anonimización | **Owner**: confirmar el plazo de anonimización (5 años) |
| F16 | **Banner de consentimiento con finalidades y versión** | El banner actual es un booleano en `localStorage` (`compass-consentimiento-privacidad = "aceptado"`): sin finalidades, sin versión de política aceptada y sin revocación equivalente. No alcanza el estándar de consentimiento libre, informado, específico, previo e inequívoco | Sin empezar | Nadie: UI + registro de versión aceptada |

## Hecho (para no volver a listarlo)

| # | Qué | Evidencia |
| --- | --- | --- |
| — | **`Notificacion.unidadId` + aviso al residente al ingresar (F5 + F13)** | Campo + índice en los dos schemas (migración `20261025000000_add_notificacion_unidad_id`, SQL portable) · scoping por unidad en la bandeja **y en la lectura por id** (`lib/api/notificaciones-scope.ts` + `unidadesVinculadasDb`, unidades del servidor nunca del cliente) · aviso server-side en la visita (POST ingresada **y** transición pre-agendada→ingresada, que el store no avisaba) y en la encomienda, con textos y flags `notificarRegistroVisitas`/`notificarEncomiendas` del store · tests `pe-avisos` (11) |
| — | **«Unidad destino» de visitas busca en el servidor (F6)** | `app/api/pe/unidades/route.ts` (proyección con `pe:bitacora`, 4 campos, estacionamiento excluido por etiqueta) · `buscarUnidades` en `lib/api/use-unidades.ts` · `SelectorBuscable` en `components/pe/visitas-panel.tsx` · etiqueta con rol SII para desambiguar homónimas · tests `pe-unidades-operacion` (6) + `visitas-unidad-buscable` (6) + `pe-panels` (11) · e2e `crud/bitacora` y `crud/roles-journeys` afirman opciones reales |
| — | **Los 16 deptos de la torre E volvieron al selector** | El filtro de destinos pasó de `!id.startsWith("u-E-")` a `etiqueta !== "Estacionamiento"` (`esUnidadDestino`, con test propio): el estacionamiento del seed comparte prefijo con la torre E |
| — | **Búsqueda por texto en el factory de colecciones (base de F6)** | `busqueda` opt-in en `lib/api/crud-factory.ts` + `?q=` en `/api/unidades` · aditivo: sin `busqueda`/sin `q` el `where` no cambia · 13 tests · PR #16 |
| — | **Paginación real en `useCrudCollection` (F11)** | `hasMore`/`cargarMas`/`cargandoMas` en `lib/api/use-crud-collection.ts` (aditivo, URL de página 1 intacta) · `components/ver-mas.tsx` · cableado en el libro de cobros de `/finanzas/pagos` · tests `use-crud-collection-paginacion` (3) + `ver-mas` (4) · PR de esta rama |
| — | **CI de GitHub sin condicionar por tipo de cambio (F12, obsoleta)** | El repo pasó a **público**: GitHub Actions no cobra minutos en repos públicos, así que condicionar los jobs al tipo de cambio dejó de tener sentido |
| — | **Variación tarifaria real en métricas (F2)** | `lib/metricas-utils.ts` + 6 tests · `/admin/metricas` muestra «—» sin periodos comparables · PR #13 |
| — | **El respaldo baja como descarga fechada, sin escribir en disco (F3)** | `POST /api/backup` sin `writeFileSync` · `lib/backup.ts` retirado · suite de seguridad del endpoint sin editar · PR #13 |
| — | **Pantalla del residente para leer comunicaciones (F1)** | change `co-lectura-residente` · bandeja propia en `/comunidad/comunicacion` con vista derivada del rol · modelo `EnvioDestinatarioCO` · e2e `flujo/lectura-residente` 8/8 |
| — | **El residente ya no ve quién leyó cada difusión** (fuga D-1) | `_lib/proyeccion-envio.ts` + 404 indistinguible · tests `co-envios-proyeccion` / `co-leer-404` |
| — | **El residente ya no ve los reportes del buzón ajeno** (fuga S10) | `_lib/buzon-alcance.ts` + `visibilidadComite` · tests `co-buzon-alcance` |
| — | **El residente ya no puede emitir difusiones masivas** (fuga D-3) | matriz `co` / `co:buzon` / `co:lecturas` · tests `authz` |
| — | **La lectura no se puede fabricar por API** | `POST /api/co/envios` rechaza `lecturas` con 400 · `co-endurecimiento` E1 |
| — | Lectura de un envío **por el destinatario**, no por el admin | PR #11 · `POST /api/co/envios/[id]/leer` |
| — | Caducidad de avisos CV **al leer** (no al abrir la pantalla) | PR #11 · `GET /api/cv/avisos` |
| — | Garantías MT verificadas **al pedir la lista** | PR #11 · `app/api/mt/_garantias.ts` |
| — | Escaneo del **QR de la cédula nueva** con webcam + validación de RUN | PR #9 |
| — | Ningún select trunca en silencio | PR #7 · `AvisoTruncamiento` |
| — | Los «desvíos» no vuelven: candado `npm run audit:desvios` en CI | PR #8 |
| — | Store legacy reducido a sus 3 excepciones justificadas | PR #6 · SERIE-FASE2 |
| — | CSV de logs con el filtro completo · KPI de fondos activos · «…y N más» en el visor | PR #10 |
