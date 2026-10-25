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
| F5 | **`Notificacion.unidadId`** | El modelo no tiene unidad, así que una difusión al rol la ve **toda la comunidad** con ese rol. No se puede segmentar «solo el piso 3» | Sin empezar | **Owner**: decidir si hace falta segmentar |
| F6 | **Selector de unidad/persona con búsqueda total** | **«Unidad destino» de la bitácora de visitas ya busca en el servidor** (rama `feat/f6-unidad-destino-buscable`): `lib/api/use-unidades.ts` (`buscarUnidades`) + `components/selector-buscable.tsx` en `visitas-panel.tsx`. De paso se corrigió que el filtro de destinos escondía los 16 departamentos de la torre E: el estacionamiento se descarta por **etiqueta**, no por el prefijo `u-E-` que ambos comparten. **Falta**: «Residente destino» sigue leyendo el store legacy con su recorte de 100, y la etiqueta de una unidad de la BD se pierde al recargar (no está en el store) | **Cableado parcial** | Nadie: siguiente pantalla y el selector de personas |
| F7 | **Lectura de la cédula anterior (PDF417 / MRZ)** | El escáner QR (PR #9) solo funciona con la cédula **nueva**. La anterior no tiene QR: su PDF417 es formato propietario del Registro Civil y el MRZ por OCR es frágil. Hoy esas visitas se cargan a mano | Fuera de alcance declarado | **Owner**: si se necesita, requiere evaluación técnica aparte |
| F8 | **Verificación de autenticidad de documentos de identidad** | El escáner **identifica** al portador (RUT + padrón) pero **no certifica que el carnet sea auténtico**. Eso exige SDK comercial (Regula, BlinkID) con licencia por dominio y costo por cotización | Sin empezar | **Owner**: presupuesto |
| F9 | **Retiro/aislamiento del módulo QA/dev antes de producción** | `admin/qa-lab`, `admin/dev-dashboard` y `admin/mantenimiento` operan sobre `localStorage` y **cualquier usuario autenticado puede acceder**. No migran: se retiran o se aíslan | Decidido, sin ejecutar | **Owner**: cuándo |
| F10 | **Allowlist de dominios para abrir documentos** | El `window.open` de documentos ya valida destino (PR #11) con una lista: origen propio + `supabase.co`/`supabase.in`. Si se suma otro proveedor de archivos, hay que agregarlo o los documentos no abren | Funcional con el default | **Owner**: qué dominios sumar |

## Hecho (para no volver a listarlo)

| # | Qué | Evidencia |
| --- | --- | --- |
| — | **«Unidad destino» de visitas busca en el servidor (F6)** | `buscarUnidades` en `lib/api/use-unidades.ts` contra `GET /api/unidades?q=` · `SelectorBuscable` en `components/pe/visitas-panel.tsx` · etiqueta con rol SII para desambiguar homónimas · tests `visitas-unidad-buscable` (6) + `pe-panels` (11) · e2e `crud/bitacora` afirma opciones reales |
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
