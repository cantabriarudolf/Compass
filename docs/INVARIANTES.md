# INVARIANTES — dueño de cada regla de datos

> Generado a partir del inventario de las 79 tablas de `prisma/schema.sqlite.prisma` y de las 156 rutas de `app/api`. Cada fila dice **qué dato**, **la regla en una frase**, **quién la impone hoy**, **todas las rutas que lo escriben** (`archivo:línea`) y **qué test la prueba**. Cuando la fila nombra una columna (`· email`, `· rut`), la lista de rutas se limita a las que escriben **esa columna**; cuando nombra la tabla, lista todo writer de la colección. `Persona` aparece desdoblada en sus dos columnas únicas (`rut`, `email`).

## Cómo leer el dueño

| Código | Significa |
|---|---|
| `DB` | Restricción en la base (`@@unique`, FK, `NOT NULL`) |
| `API` | Lógica en una o pocas rutas (Zod + guards + transacción) |
| `CENTRAL` | Función única en `lib/invariantes/` que todas las rutas llaman |
| `CADA FORMULARIO ⚠` | Sólo existe en el `window.confirm()` de una pantalla; la API no la conoce |
| `NADIE ⚠` | Nadie la impone |

## Paso 1 — Reglas sin dueño único

Las filas marcadas `CADA FORMULARIO ⚠`, `NADIE ⚠` o con dos puertas distintas para la misma columna:

| Dato | Regla | Dueño real hoy | Dónde vive |
|---|---|---|---|
| `Persona` · `email` | Único por comunidad | era **puerta partida**: `/api/personas` sí, `/api/mis-datos` no | centralizada → `lib/invariantes/persona.ts` |
| `Persona` · `rut` | Único por comunidad | era **puerta única** (`/api/personas`) | centralizada → `lib/invariantes/persona.ts` |
| `MicroSector` | Nombre/etiqueta único por macro sector | **CADA FORMULARIO** (D5 dice permitido) | `app/inventario/estructura/page.tsx:212` |
| `Persona` · `nombreCompleto` | Sin duplicados de nombre | **CADA FORMULARIO** (no es regla de spec) | `components/comunidad/formulario-persona.tsx:88` |
| `TipoUnidad` · `nombre` | Único por comunidad | **CADA FORMULARIO + DB contradictorios**: la UI avisa "repetidos permitidos", la DB responde 409 | `app/inventario/tipos/page.tsx:131` vs `@unique` |
| `MacroSector` · `nombre` | Único por comunidad | **CADA FORMULARIO + DB parcial**: la UI compara nombre+etiqueta, la DB sólo nombre | `app/inventario/estructura/page.tsx:162` vs `@unique` |

Ya resueltas (salieron de esta lista): `Persona.email`/`Persona.rut` (**INV-01**), `CierreTurnoPE` (**INV-02**) y `EventoAuditoria` (**INV-03**).

## Paso 2 — Tabla completa


### Núcleo multi-tenant (ST / AU / SG)

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `Comunidad` | Una comunidad = un tenant raíz; `slug` único | `DB` — `@unique slug`; alta sólo por seed (`scripts/seed-db-from-mocks.ts:117`) | **ninguna ruta** | — (sin test de regla) |
| `Usuario` | Cuenta global; email único; una persona por usuario | `DB` — `@unique email`; validación inline en la ruta (sin schema Zod) | `app/api/admin/usuarios/route.ts:161`<br>`app/api/admin/usuarios/route.ts:169`<br>`app/api/auth/2fa/backup/route.ts:75`<br>`app/api/auth/2fa/disable/route.ts:61`<br>`app/api/auth/2fa/setup/route.ts:39`<br>`app/api/auth/2fa/verify-setup/route.ts:67`<br>`app/api/mis-datos/route.ts:126`<br>`app/api/mis-datos/route.ts:196` | — (sin test de regla) |
| `Membresia` | Un usuario ↔ una comunidad, un par por vez; **es la fuente del tenant de cada request** | `DB` — `@unique([usuarioId,comunidadId])` + `withComunidadScope` (`lib/api/with-comunidad-scope.ts:37`) | `app/api/admin/usuarios/route.ts:154` | — (sin test de regla) |
| `RateLimitAttempt` | Ventana de intentos por clave (anti fuerza bruta) | `API` — `lib/rate-limit.ts` es el único escritor; sin ruta | **ninguna ruta** | — (sin test de regla) |

### EF / TU — Estructura física

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `TipoUnidad` | Nombre único por comunidad; baja lógica (`activo`); no se borra si hay unidades | `DB` + `API` — `@unique([comunidadId,nombre])` + guard | `app/api/tipos-unidad/route.ts:19` | — (sin test de regla) |
| `MacroSector` | Nombre único por comunidad; no se borra con microsectores | `DB` + `API` — `@unique([comunidadId,nombre])` + guard | `app/api/macro-sectores/route.ts:18` | — (sin test de regla) |
| `MicroSector` | Nombre/etiqueta únicos **dentro del macro sector** (según la UI) | `CADA FORMULARIO ⚠` — `app/inventario/estructura/page.tsx:212` avisa con `confirm()`; la API acepta duplicados y D5 dice 'repetidos permitidos' | `app/api/micro-sectores/[id]/route.ts:62`<br>`app/api/micro-sectores/route.ts:24`<br>`app/api/micro-sectores/route.ts:105` | — (sin test de regla) |
| `Unidad` | 3 FKs verificadas contra la comunidad; no se borra con vínculos; `numero` repetible a propósito | `API` — `verificarReferenciasUnidad` + `beforeDelete` (`app/api/unidades/route.ts:41`); sin `@unique` por decisión D5 | `app/api/unidades/[id]/route.ts:68`<br>`app/api/unidades/route.ts:25`<br>`app/api/unidades/route.ts:145` | — (sin test de regla) |

### MP / VU — Personas y vínculos

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `Persona` · `rut` | Dos fichas de la misma comunidad no comparten RUT | `CENTRAL` — `lib/invariantes/persona.ts:personaConRutDuplicado`, usada por `/api/personas` | `app/api/personas/route.ts:229` | `test/api/personas.test.ts` (RUT duplicado → 409) |
| `Persona` · `email` | Dos fichas de la misma comunidad no comparten email (se persiste canónico, minúsculas) | `CENTRAL` — `lib/invariantes/persona.ts:personaConEmailDuplicado`, usada por `/api/personas` **y** `/api/mis-datos` | `app/api/personas/route.ts:235`<br>`app/api/mis-datos/route.ts:181` | `test/api/invariantes-persona.test.ts` (2 pruebas: acepta libre / rechaza ajeno) |
| `VinculoUnidad` | Un tramo vigente por persona+unidad+rol; `cerrarAnterior` cierra el previo; `permiteVerFinanzas` obligatorio | `API` — transacción en `app/api/vinculos/route.ts:111` + Zod | `app/api/vinculos/[id]/route.ts:105`<br>`app/api/vinculos/route.ts:131`<br>`app/api/vinculos/route.ts:172` | — (sin test de regla) |

### MA — Maestros administrativos

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `Afp` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:46` | — (sin test de regla) |
| `PrevisionSalud` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:48` | — (sin test de regla) |
| `MutualCaja` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:52` | — (sin test de regla) |
| `Feriado` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:55` | — (sin test de regla) |
| `Banco` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:56` | — (sin test de regla) |
| `IndiceAjuste` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:58` | — (sin test de regla) |
| `CajaFondo` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:62` | — (sin test de regla) |
| `UnidadMedida` | Catálogo **nacional**: fila de sólo lectura por comunidad; se oculta o se agrega la propia | `API` — `guardNacional` (`app/api/maestros/[tipo]/[id]/route.ts:24`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:70` | — (sin test de regla) |
| `CategoriaInsumo` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:66` | — (sin test de regla) |
| `ContactoEmergencia` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:74` | — (sin test de regla) |
| `CondicionEspecial` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:78` | — (sin test de regla) |
| `EstadoOcupacion` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:82` | — (sin test de regla) |
| `CategoriaMacro` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:86` | — (sin test de regla) |
| `CategoriaMicro` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:90` | — (sin test de regla) |
| `CategoriaUnidad` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:94` | — (sin test de regla) |
| `EstadoInmobiliario` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:98` | — (sin test de regla) |
| `AsignacionFamiliar` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:102` | — (sin test de regla) |
| `Jornada` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:105` | — (sin test de regla) |
| `Courier` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:106` | — (sin test de regla) |
| `Contratista` | Catálogo propio de la comunidad; nombre obligatorio; no se borra si está referenciado | `API` — `beforeDeleteMaestro` (`app/api/maestros/[tipo]/route.ts:129`); sin `@unique` de nombre ⚠ | `app/api/maestros/[tipo]/route.ts:108` | — (sin test de regla) |
| `MaestroOculto` | Marca de ocultamiento por comunidad; la fila nacional nunca se toca | `DB` — `@unique([comunidadId,tipo,maestroId])` | `app/api/maestros/[tipo]/ocultar/route.ts:61`<br>`app/api/maestros/[tipo]/ocultar/route.ts:73` | — (sin test de regla) |

### CF / AM — Configuración y auditoría

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `ConfiguracionGlobal` | Singleton por comunidad; `PUT` = upsert, nunca colección | `DB` — `@unique comunidadId` + Zod | `app/api/configuracion/route.ts:99`<br>`app/api/configuracion/route.ts:103` | — (sin test de regla) |
| `EventoAuditoria` | Un evento por acción, con forma mínima validada, escrito por una sola puerta y sin update/delete | `CENTRAL` — `lib/auditoria.ts` (`registrarEventoAuditoria`, `registrarEventosAuditoria`, `upsertEventoAuditoria`) valida con `EventoAuditoriaSchema` antes de escribir; 30 sitios migrados | `app/api/actas-gd/[id]/route.ts:195`<br>`app/api/auditoria/sync/route.ts:115`<br>`app/api/cobros-fi/[id]/mora/route.ts:108`<br>`app/api/cobros-fi/[id]/pagar/route.ts:146`<br>`app/api/cobros-fi/_cobranza.ts:164`<br>`app/api/co/documentos/[id]/route.ts:52`<br>`app/api/co/envios/[id]/lecturas/route.ts:54`<br>`app/api/configuracion/route.ts:127`<br>`app/api/controles-propiedad/[id]/route.ts:195`<br>`app/api/cv/_actas.ts:89`<br>`app/api/cv/avisos/route.ts:68`<br>`app/api/fondos-fi/[id]/retirar/route.ts:156`<br>`app/api/in/infracciones/_acciones.ts:101`<br>`app/api/ingresos-fi/route.ts:109`<br>`app/api/ir/_acciones.ts:105`<br>`app/api/ir/recursos/[id]/route.ts:75`<br>`app/api/leads-portal/route.ts:113`<br>`app/api/liquidaciones/[id]/confirmar/route.ts:168`<br>`app/api/liquidaciones/adelantos/[id]/desestimar/route.ts:56`<br>`app/api/liquidaciones/adelantos/route.ts:282`<br>`app/api/liquidaciones/route.ts:394`<br>`app/api/mis-datos/route.ts:55`<br>`app/api/mt/_acciones.ts:81`<br>`app/api/pe/_acciones.ts:123`<br>`app/api/pe/cierres-turno/[id]/route.ts:73`<br>`app/api/personas/route.ts:280`<br>`app/api/periodos-directiva/route.ts:334`<br>`app/api/ra/_acciones.ts:92`<br>`app/api/reportes-re/_acciones.ts:98`<br>`app/api/pe/turnos/iniciar/route.ts` (emite vía `registrarEventoPE`) | `test/api/invariantes-auditoria.test.ts` (2 pruebas: forma persistida / rechazo sin escribir) |

### PI — Portal inmobiliario

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `PublicacionPortal` | Una publicación por unidad con estado publicado; no se borra con leads | `API` — guard `beforeDelete` + `puede:pi` | `app/api/publicaciones-portal/route.ts:21` | — (sin test de regla) |
| `LeadPortal` | Contacto seguro: el residente no ve datos del lead | `API` — Zod + `puede:pi` | `app/api/leads-portal/route.ts:27`<br>`app/api/leads-portal/route.ts:74` | — (sin test de regla) |

### Notificaciones

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `Notificacion` | Una notificación por evento y destinatario; `leida` sólo la marca el destinatario (ABAC) | `API` — `puede:notificaciones:propias` + filtro por destinatario en `/api/notificaciones/[id]/leer` | `app/api/cobros-fi/[id]/cobranza/route.ts:277`<br>`app/api/leads-portal/route.ts:98`<br>`app/api/liquidaciones/adelantos/route.ts:293`<br>`app/api/notificaciones/[id]/leer/route.ts:70`<br>`app/api/notificaciones/[id]/route.ts:104`<br>`app/api/notificaciones/route.ts:34`<br>`app/api/pe/_visitas.ts:74`<br>`app/api/pe/encomiendas/route.ts:46`<br>`app/api/pe/proyecciones/enviar/route.ts:114`<br>`app/api/reportes-re/[id]/distribuir/route.ts:143` | — (sin test de regla) |

### GD / AD — Directiva y administración

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `ActaGD` | Borrador → aprobada; una aprobada no se edita; desestimar archiva | `API` — Zod + guard de estado (`actas-gd/[id]/aprobar`) | `app/api/actas-gd/[id]/aprobar/route.ts:103`<br>`app/api/actas-gd/[id]/route.ts:126`<br>`app/api/actas-gd/[id]/route.ts:186`<br>`app/api/actas-gd/route.ts:213` | — (sin test de regla) |
| `ActaGDArchivada` | Copia histórica inmutable | `NADIE ⚠` (sin schema ni guard; la inmutabilidad depende de que no haya writer) | `app/api/actas-gd/[id]/route.ts:179` | — (sin test de regla) |
| `ControlPropiedad` | Un control por unidad; archivado al cerrar | `API` — Zod | `app/api/controles-propiedad/[id]/route.ts:126`<br>`app/api/controles-propiedad/[id]/route.ts:188`<br>`app/api/controles-propiedad/route.ts:176` | — (sin test de regla) |
| `ControlPropiedadArchivada` | Copia histórica inmutable | `NADIE ⚠` (sin schema ni guard) | `app/api/controles-propiedad/[id]/route.ts:181` | — (sin test de regla) |
| `PeriodoDirectiva` | Un solo período `vigente` por comunidad; cerrado no se reabre; nómina congelada | `API` — rotación en `app/api/periodos-directiva/route.ts:314`; **sin índice único parcial** ⚠ | `app/api/periodos-directiva/[id]/cerrar/route.ts:82`<br>`app/api/periodos-directiva/[id]/route.ts:116`<br>`app/api/periodos-directiva/[id]/route.ts:166`<br>`app/api/periodos-directiva/route.ts:177`<br>`app/api/periodos-directiva/route.ts:320` | — (sin test de regla) |

### CO — Comunicación con vecinos

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `PlantillaCO` | Plantilla por categoría; nombre obligatorio | `API` — Zod + `puede:co` | `app/api/co/plantillas/[id]/route.ts:12`<br>`app/api/co/plantillas/route.ts:12` | — (sin test de regla) |
| `EnvioCO` | El alta escribe envío + destinatarios + lecturas en una transacción; la lectura sólo la registra el destinatario | `API` — Zod + rechazo explícito de `lecturas` en el POST + `$transaction` | `app/api/co/_lib/escritura-envio.ts:94`<br>`app/api/co/_lib/escritura-envio.ts:105`<br>`app/api/co/_lib/escritura-envio.ts:110`<br>`app/api/co/_lib/registro-lectura.ts:49`<br>`app/api/co/envios/[id]/route.ts:29` | — (sin test de regla) |
| `EnvioDestinatarioCO` | Un destinatario por (envío, persona); el tenant se hereda del envío (sin `comunidadId` propio) | `DB` — `@unique([envioId,personaId])` + FK cascade | `app/api/co/_lib/escritura-envio.ts:52`<br>`app/api/co/_lib/escritura-envio.ts:57`<br>`app/api/co/_lib/registro-lectura.ts:37` | — (sin test de regla) |
| `MensajeBuzonCO` | Ticket con estado y respuestas; no retrocede de estado | `API` — Zod + `puede:co:buzon` | `app/api/co/mensajes-buzon/[id]/route.ts:20`<br>`app/api/co/mensajes-buzon/route.ts:102` | — (sin test de regla) |
| `DocumentoCO` | Biblioteca comunal; media por URL (D1), jamás `data:` | `API` — Zod + `puede:co` | `app/api/co/documentos/[id]/route.ts:17`<br>`app/api/co/documentos/route.ts:12` | — (sin test de regla) |

### GE / IR / IN — Solicitudes, inventario, infracciones

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `SolicitudGE` | Workflow de estados tipificado con historial | `API` — Zod + `puede:ge` | `app/api/ge/solicitudes/[id]/route.ts:12`<br>`app/api/ge/solicitudes/route.ts:13` | — (sin test de regla) |
| `RecursoIR` | Stock nunca negativo; alarma de stock crítico; ubicación EF del tenant | `API` — transacción en `ir/solicitudes-insumo/[id]/entregar` | `app/api/ir/recursos/[id]/route.ts:17`<br>`app/api/ir/recursos/route.ts:14`<br>`app/api/ir/solicitudes-insumo/[id]/entregar/route.ts:75`<br>`app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route.ts:132`<br>`app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route.ts:168` | — (sin test de regla) |
| `SolicitudInsumoIR` | Consumo trazable; comodín no catalogado; la entrega descuenta stock atómicamente | `API` — transacción + Zod | `app/api/ir/solicitudes-insumo/[id]/entregar/route.ts:68`<br>`app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route.ts:90`<br>`app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route.ts:119`<br>`app/api/ir/solicitudes-insumo/[id]/resolver-comodin/route.ts:181`<br>`app/api/ir/solicitudes-insumo/[id]/route.ts:13`<br>`app/api/ir/solicitudes-insumo/route.ts:24` | — (sin test de regla) |
| `EntregaEPP` | Registro individual por persona, no por unidad | `API` — Zod + `puede:ir:mantenimiento` | `app/api/ir/entregas-epp/[id]/route.ts:13`<br>`app/api/ir/entregas-epp/route.ts:13` | — (sin test de regla) |
| `TipoInfraccionIN` | Catálogo parametrizable por comunidad | `API` — Zod + `puede:in` | `app/api/in/tipos/[id]/route.ts:12`<br>`app/api/in/tipos/route.ts:14` | — (sin test de regla) |
| `InfraccionIN` | Ciclo aplicar → apelar → desestimar → respaldar; multa grave exige respaldo; aplicar materializa un `CobroFI` | `API` — guards de estado por ruta + transacción | `app/api/in/infracciones/[id]/apelar/route.ts:60`<br>`app/api/in/infracciones/[id]/aplicar/route.ts:182`<br>`app/api/in/infracciones/[id]/desestimar/route.ts:43`<br>`app/api/in/infracciones/[id]/respaldar/route.ts:58`<br>`app/api/in/infracciones/[id]/route.ts:12`<br>`app/api/in/infracciones/route.ts:12` | — (sin test de regla) |

### MT / RA — Mantenimiento y reservas

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `TrabajoMT` | iniciado → finalizado; garantía se verifica una sola vez | `API` — guards de estado + transacción | `app/api/mt/_garantias.ts:62`<br>`app/api/mt/trabajos/[id]/finalizar/route.ts:86`<br>`app/api/mt/trabajos/[id]/finalizar/route.ts:118`<br>`app/api/mt/trabajos/[id]/iniciar/route.ts:35`<br>`app/api/mt/trabajos/[id]/route.ts:12`<br>`app/api/mt/trabajos/route.ts:29`<br>`app/api/mt/trabajos/route.ts:100`<br>`app/api/pe/tareas-monitoreo/[id]/completar/route.ts:46` | — (sin test de regla) |
| `ProyectoMT` | Proyecto de obra con origen de fondos declarativo | `API` — Zod + `puede:mt` | `app/api/mt/proyectos/[id]/route.ts:12`<br>`app/api/mt/proyectos/route.ts:21` | — (sin test de regla) |
| `ElementoRA` | Elemento reservable; `activo` gobierna la reserva | `API` — Zod + `puede:ra` | `app/api/ra/elementos/[id]/route.ts:14`<br>`app/api/ra/elementos/route.ts:14` | — (sin test de regla) |
| `ReservaRA` | Sin overbooking (solapamiento + capacidad revalidados en transacción); gate de morosidad FI | `API` — `$transaction` (`app/api/ra/reservas/route.ts:133`) + guards | `app/api/ra/reservas/[id]/cancelar/route.ts:96`<br>`app/api/ra/reservas/[id]/retener/route.ts:98`<br>`app/api/ra/reservas/[id]/route.ts:15`<br>`app/api/ra/reservas/route.ts:47`<br>`app/api/ra/reservas/route.ts:152`<br>`app/api/ra/reservas/route.ts:201` | — (sin test de regla) |

### CV — Visor de mensajes

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `ActaPublicadaCV` | Un acta GD se publica una sola vez; se despublica con motivo | `DB` — `@unique([comunidadId,actaId])` | `app/api/cv/actas/[actaId]/despublicar/route.ts:42`<br>`app/api/cv/actas/route.ts:218`<br>`app/api/cv/actas/route.ts:219` | — (sin test de regla) |
| `AvisoCV` | Ciclo de vida con caducidad; multimedia excluyente por URL | `API` — Zod + `puede:cv` | `app/api/cv/avisos/[id]/route.ts:14`<br>`app/api/cv/avisos/route.ts:21`<br>`app/api/cv/avisos/route.ts:56` | — (sin test de regla) |
| `PlantillaCV` | Plantilla rápida operativa | `API` — Zod | `app/api/cv/plantillas/[id]/route.ts:12`<br>`app/api/cv/plantillas/route.ts:12` | — (sin test de regla) |

### FI / GC — Finanzas y gasto común

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `FondoFI` | Nombre único por comunidad; no se borra con movimientos | `DB` + `API` — `@unique([comunidadId,nombre])` + `beforeDelete` | `app/api/fi/sync/route.ts:184`<br>`app/api/fondos-fi/[id]/route.ts:67`<br>`app/api/fondos-fi/route.ts:26`<br>`app/api/fondos-fi/route.ts:120` | — (sin test de regla) |
| `IngresoFI` | Fecha + monto + concepto + fondo del tenant | `API` — Zod | `app/api/fi/sync/route.ts:254`<br>`app/api/ingresos-fi/[id]/route.ts:58`<br>`app/api/ingresos-fi/route.ts:25`<br>`app/api/ingresos-fi/route.ts:99` | — (sin test de regla) |
| `EgresoFI` | Comprobante por URL (D1); retiro de fondo y confirmación de liquidación escriben egreso | `API` — Zod + transacción | `app/api/egresos-fi/[id]/route.ts:63`<br>`app/api/egresos-fi/route.ts:25`<br>`app/api/egresos-fi/route.ts:167`<br>`app/api/fi/sync/route.ts:216`<br>`app/api/fondos-fi/[id]/retirar/route.ts:148`<br>`app/api/liquidaciones/[id]/confirmar/route.ts:99` | — (sin test de regla) |
| `EmisionGC` | Un período no se emite dos veces; imputa a fondo de GC activo y genera cobros por unidad | `API` — guard en `app/api/emisiones-gc/route.ts:73`; **sin `@unique([comunidadId,periodo])`** ⚠ | `app/api/emisiones-gc/[id]/route.ts:61`<br>`app/api/emisiones-gc/[id]/route.ts:106`<br>`app/api/emisiones-gc/route.ts:29`<br>`app/api/emisiones-gc/route.ts:210` | — (sin test de regla) |
| `CobroFI` | Un cobro por unidad y período; mora, pago y diferencia manual inmutables | `API` — Zod + guards de estado ⚠ (sin unique de unidad+período) | `app/api/cobros-fi/[id]/mora/route.ts:102`<br>`app/api/cobros-fi/[id]/pagar/route.ts:134`<br>`app/api/cobros-fi/[id]/route.ts:88`<br>`app/api/cobros-fi/route.ts:27`<br>`app/api/emisiones-gc/[id]/route.ts:103`<br>`app/api/emisiones-gc/route.ts:215`<br>`app/api/in/infracciones/[id]/aplicar/route.ts:196`<br>`app/api/ra/_acciones.ts:212` | — (sin test de regla) |
| `ConfiguracionCobranzaFI` | Config singleton de cobranza por comunidad | `DB` — `@unique comunidadId` | `app/api/cobros-fi/canales/route.ts:119` | — (sin test de regla) |
| `PreferenciaCanalCobranzaFI` | Una preferencia por persona; el residente elige su canal | `DB` — `@unique([comunidadId,personaId])` + ABAC | `app/api/cobros-fi/canales/route.ts:172` | — (sin test de regla) |
| `EnvioCobranzaFI` | Un envío por `claveEnvio` (idempotente) | `DB` — `@unique([comunidadId,claveEnvio])` + upsert | `app/api/cobros-fi/[id]/cobranza/route.ts:255` | — (sin test de regla) |

### PE — Personal y servicios

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `BitacoraVisitaPE` | Nombre + DNI obligatorios; `origenAgenda`/`estado` cerrados; notifica | `API` — Zod + `puede:pe` | `app/api/pe/bitacora-visitas/[id]/route.ts:29`<br>`app/api/pe/bitacora-visitas/route.ts:25` | — (sin test de regla) |
| `EncomiendaPE` | Courier obligatorio; destinatario **o** unidad; el retiro exige `retiradoPor` | `API` — Zod (`lib/schemas.ts:1416`) | `app/api/pe/encomiendas/[id]/route.ts:21`<br>`app/api/pe/encomiendas/route.ts:62` | — (sin test de regla) |
| `IngresoContratistaPE` | Motivo ≥ 5 caracteres; contratista del tenant | `API` — Zod | `app/api/pe/ingresos-contratistas/[id]/route.ts:20`<br>`app/api/pe/ingresos-contratistas/route.ts:17` | — (sin test de regla) |
| `ProveedorPE` | RUT único por comunidad | `DB` — `@unique([comunidadId,rut])` | `app/api/pe/proveedores/[id]/route.ts:12`<br>`app/api/pe/proveedores/route.ts:13` | — (sin test de regla) |
| `MantencionPreventivaPE` | Ciclo preventivo por proveedor del tenant | `API` — Zod | `app/api/pe/mantenciones/[id]/route.ts:12`<br>`app/api/pe/mantenciones/route.ts:12` | — (sin test de regla) |
| `VisitaTecnicaPE` | Visita con proveedor del tenant | `API` — Zod | `app/api/pe/visitas-tecnicas/[id]/route.ts:12`<br>`app/api/pe/visitas-tecnicas/route.ts:12` | — (sin test de regla) |
| `CierreTurnoPE` | Un cierre por trabajador, fecha y jornada; identidad por ficha (RUT), nunca por nombre | `CENTRAL` — `lib/invariantes/pe.ts:cierreTurnoDuplicado` vía `antesDeEscribir` de la factory CRUD (POST) y del put-merge (PUT) | `app/api/pe/cierres-turno/route.ts:21`<br>`app/api/pe/cierres-turno/[id]/route.ts:39` | `test/api/invariantes-cierre-turno.test.ts` (3 pruebas: homónimos con RUT distinto / mismo trabajador 409 / PUT no puede mover el cierre a otro trabajador) |
| `ProyeccionPE` | Proyección operativa derivada de feriados MA | `API` — Zod | `app/api/liquidaciones/route.ts:388`<br>`app/api/pe/proyecciones/[id]/route.ts:12`<br>`app/api/pe/proyecciones/enviar/route.ts:93`<br>`app/api/pe/proyecciones/route.ts:12` | — (sin test de regla) |

### PL / CT / RE

| Dato | Regla | Dueño hoy | Rutas que lo escriben (`archivo:línea`) | Test que la prueba |
|---|---|---|---|---|
| `LiquidacionPL` | Sólo borrador se edita/borra; sin egreso sincronizado no se elimina; los totales los calcula el servidor | `API` — `guardBorrador` (`app/api/liquidaciones/route.ts:42`) | `app/api/liquidaciones/[id]/confirmar/route.ts:115`<br>`app/api/liquidaciones/route.ts:60`<br>`app/api/liquidaciones/route.ts:380` | — (sin test de regla) |
| `AdelantoPL` | Motivo ≥ 5 caracteres; desestimar no borra; descuenta en la liquidación | `API` — Zod + transacción | `app/api/liquidaciones/[id]/confirmar/route.ts:132`<br>`app/api/liquidaciones/[id]/confirmar/route.ts:157`<br>`app/api/liquidaciones/adelantos/[id]/desestimar/route.ts:51`<br>`app/api/liquidaciones/adelantos/[id]/route.ts:15`<br>`app/api/liquidaciones/adelantos/route.ts:51`<br>`app/api/liquidaciones/adelantos/route.ts:278` | — (sin test de regla) |
| `CertificadoCT` | Folio correlativo por comunidad asignado en transacción | `DB` — `@unique([comunidadId,folio])` | `app/api/certificados-ct/route.ts:26` | — (sin test de regla) |
| `ReporteRE` | Número correlativo por comunidad; snapshot inmutable; distribución y lecturas registradas | `DB` + `API` — `@unique([comunidadId,numero])` + transacciones | `app/api/reportes-re/[id]/distribuir/route.ts:163`<br>`app/api/reportes-re/[id]/lectura/route.ts:48`<br>`app/api/reportes-re/generar/route.ts:191`<br>`app/api/reportes-re/route.ts:17` | — (sin test de regla) |

## Cobertura de tests por regla

De las filas de arriba, sólo unas pocas tienen un test que prueba la regla (y no sólo la ruta): `Persona.email`, `CierreTurnoPE` y `EventoAuditoria` (INV-01/02/03, nuevos), `Persona.rut` (`test/api/personas.test.ts`) y `ReservaRA` (solapamiento, `test/api/fase4-ra.test.ts`). El resto tiene cobertura de ruta —que la respuesta sea 200/409— pero no de invariante. Eso es lo que `npm run check:invariantes` empieza a cerrar: hoy corre 7 pruebas: dos por regla (acepta / rechaza) para INV-01 (`Persona.email`), tres para INV-02 (`CierreTurnoPE`, incluida la puerta del PUT) y dos para INV-03 (`EventoAuditoria`).

