# 📋 MK - Data Dump: Comunicación y Solicitudes (Sesión 2 NSGC)

> Registros resueltos de las colecciones CO/GE. La única colección **con datos sembrados** es `plantillasCO` (5 plantillas del NSGC); `enviosCO`, `mensajesBuzonCO`, `documentosCO` y `solicitudesGE` están **vacías por diseño** y se pueblan desde la UI.
> Fuente: `k0mp4ss_fe/apps/web/data/comunidad/plantillas-co.ts` + `lib/store.ts` (seeds) + `lib/schemas.ts` (esquemas). Store v14/v15.

## 📢 Plantillas CO — `plantillasCO` (5 registros sembrados)

| ID | Nombre | Categoría | Asunto | Cuerpo |
|----|--------|-----------|--------|--------|
| `plant-co-asamblea-ordinaria` | Citación a Asamblea Ordinaria | comunidad | Primera Asamblea General | Se cita a todos los copropietarios a la asamblea que se realizará en el salón de eventos el próximo sábado. |
| `plant-co-corte-agua` | Suspensión de Agua Potable | urgente | CORTE DE AGUA EMERGENCIA | Atención: Debido a una rotura de matriz externa, el servicio de agua potable será suspendido por 4 horas. |
| `plant-co-recordatorio-gc` | Recordatorio Pago Gastos Comunes | cobranza | Vencimiento Gasto Común | Estimado/a `[Nombre_Usuario]`, le recordamos que el plazo para el pago del gasto común vence el día 5 de este mes. |
| `plant-co-mantencion-ascensores` | Aviso de Mantención de Ascensores | informacion | Mantención Programada: Ascensores | Estimados residentes, informamos que mañana se realizará la mantención de los ascensores de la `[Nombre_Torre]`. |
| `plant-co-bienvenida` | Mensaje de Bienvenida y Activación de Cuenta | onboarding | Bienvenido a `[Nombre_Comunidad]` - Instrucciones de Acceso | Estimado/a `[Nombre_Usuario]`, su cuenta de acceso al sistema de gestión ha sido activada. Su usuario es este correo electrónico y su contraseña inicial es su RUT (sin puntos ni guiones). Le recomendamos cambiar su clave al ingresar por primera vez. |

### Patrón para crear plantillas manualmente

```
ID:        plant-{tema}  (ej: plant-co-corte-luz)
Categoría: comunidad | urgente | cobranza | informacion | onboarding
Variables: [Nombre_Usuario] [Nombre_Torre] [Nombre_Comunidad]
           → se sustituyen por destinatario al ENVIAR, la plantilla queda intacta
```

---

## 📮 Envíos Masivos — `enviosCO` (0 registros)

Vacía por diseño. Cada envío guarda un snapshot inmutable de destinatarios.

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | string | ✅ | Patrón `env-{timestamp}` |
| `asunto`, `cuerpo` | string | ✅ | Con variables aún sin resolver |
| `plantillaId?` | string | — | FK a `plantillasCO`; bloquea su eliminación |
| `destinatarios[]` | `{personaId, unidadId?}` | ✅ (≥1) | Snapshot resuelto por filtros EF/MP |
| `fechaEnvio` | ISO | ✅ | |
| `lecturas[]` | personaIds | ✅ ([]) | Confirmación simulada; tasa apertura = lecturas/total |

---

## 📥 Buzón Ciudadano — `mensajesBuzonCO` (0 registros)

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | string | ✅ | Patrón `buz-{timestamp}` |
| `folio` | string | ✅ | `BUZ-0001`, `BUZ-0002`… generado por el store en alta |
| `clasificacion` | felicitacion / sugerencia / reclamo | ✅ | UI las presenta en ese orden constructivo |
| `reportantePersonaId?` / `reportanteNombre` | string | ✅ nombre | FK validada si hay persona |
| `unidadId?` | string | — | |
| `asunto`, `cuerpo` | string | ✅ | |
| `visibilidadComite` | boolean | ✅ | false = solo Administración |
| `fechaIngreso` | ISO | ✅ | |
| `estado` | recibido / en_gestion / resuelto / cerrado | ✅ | Alta forzada a `recibido`; responder auto-pasa a `en_gestion`; matriz estricta |
| `respuestas[]` | `{id, autor, texto, compromisos?, fecha}` | ✅ ([]) | Mediación y compromisos |

El ciclo operativo del ticket vive en `solicitudesGE` (tipo `buzon`) vía `mensajeBuzonId`.

---

## 📚 Biblioteca — `documentosCO` (0 registros)

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | string | ✅ | Patrón `doc-{timestamp}` |
| `nombre` | string | ✅ | Ej: "Reglamento de Copropiedad.pdf" |
| `categoria` | string | ✅ | reglamento / acta / operativo |
| `tipoMime` | string | ✅ | application/pdf, image/png… |
| `tamanoKB` | number ≥ 0 | ✅ | Solo metadato |
| `url` | string ≤2048 | ✅ | D1: http(s); rechaza `data:` y `blob:` |

Descarga auditada con `registrarDescargaDocCO` → evento `CO_DOC_DOWNLOAD`.

---

## 🎫 Tickets — `solicitudesGE` (0 registros)

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | string | ✅ | Patrón `sol-{timestamp}` |
| `folio` | string | ✅ | `GE-0001`, `GE-0002`… generado por el store en alta |
| `tipo` | insumos / grabaciones / buzon | ✅ | Define el detalle obligatorio |
| `titulo`, `descripcion` | string | ✅ | Tipo buzon hereda del mensaje CO |
| `solicitantePersonaId?` / `unidadId?` | string | según tipo | Grabaciones EXIGE unidad (conserje incluido) |
| `estado` | nuevo / en_revision / requiere_accion_vecino / en_proceso / resuelto / cerrado | ✅ | Alta forzada a `nuevo` |
| `fechaCreacion` | ISO | ✅ | |
| `comentarios[]` | `{id, autorRol administracion\|solicitante, texto, fecha ISO-datetime}` | ✅ ([]) | Trazabilidad |
| `detalleGrabaciones?` | `{fechaSuceso, horaSuceso HH:MM, justificación ≥20 chars}` | tipo grabaciones | Suceso CCTV |
| `detalleInsumos?` | `{areaDestino, materialSolicitado}` | tipo insumos | Material con referencia pendiente a IR |
| `mensajeBuzonId?` | string | tipo buzon | FK a `mensajesBuzonCO` |
| `resolucion?` / `fechaCierre?` | string / ISO | al resolver/cerrar | SLA |
| `historialEstados[]` | `{de?, a, fecha ISO-datetime}` | ✅ | Alimenta SLA promedio en horas |

### Workflow automático

```
nuevo ──(abrir admin)──▶ en_revision ──(admin pide datos)──▶ requiere_accion_vecino
                              │                                    │
                              │                          (vecino responde)
                              │                                    ▼
                              └────────────────────────────▶ en_proceso
                                                                     │
                                                    (resolver con texto) ▼ resuelto ──(cerrar)──▶ cerrado
```

---

*Última actualización: 25 de Agosto 2026 — Sesión 2 NSGC (store v14/v15)*
