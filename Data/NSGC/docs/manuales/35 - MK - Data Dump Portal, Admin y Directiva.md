# 📋 MK - Data Dump: Portal, Notificaciones, Admin y Directiva (Sesión 1 NSGC)

> Registros de las colecciones PI/AD/GD **ya resueltos**: hoy están **vacíos por diseño** — nacen con el store v13 sin filas y se pueblan desde la UI.
> Fuente: `k0mp4ss_fe/apps/web/lib/store.ts` (seeds) + `lib/schemas.ts` (esquemas).

## 🏠 Publicaciones Portal (0 registros)

Vacía por diseño: la vitrina se llena sola cuando un vínculo VU marca "En Arriendo"/"En Venta".

### Estructura de campos

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | string | ✅ | |
| `unidadId` | string | ✅ | FK a `u-*` |
| `operacion` | venta / arriendo | ✅ | |
| `precio` | number ≥ 0 | ✅ | |
| `moneda` | CLP / UF | — | |
| `dormitorios`, `banos` | enteros ≥ 0 | — | |
| `etiquetaEstado`, `descripcion`, `condicionesContractuales` | string | — | Texto libre de la ficha |
| `urlMapa` | URL o "" | — | |
| `imagenes[]` | referencia (URL + metadatos) | ✅ (puede ser []) | D1: jamás base64/Blob |
| `activa` | boolean | ✅ | |
| `fechaPublicacion` | ISO | ✅ | |

### Patrón para crear registros manualmente

```
ID:          pub-{timestamp} o pub-{unidadId}
UnidadId:    u-A-101 (debe existir y su vínculo estar En Arriendo / En Venta)
Operación:   coherente con el estado del vínculo
Imágenes:    [{url: "https://...", alt: "..."}]  → nunca data:
```

---

## 📮 Leads Portal (0 registros)

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | string | ✅ | Patrón: `lead-{timestamp}` |
| `publicacionId` | string | ✅ | FK a publicación |
| `nombreContacto` | string | ✅ | Quien consulta |
| `contacto` | string | ✅ | Teléfono o correo del interesado |
| `mensaje` | string | — | |
| `fecha` | ISO | ✅ | |
| `atendido` | boolean | ✅ | Marcar tras responder |

Al crear un lead el store notifica al propietario (`notify()`, canal `email_simulado`) y registra `PI_LEAD_CONTACT`.

---

## 🔔 Notificaciones (0 registros — bandeja simulada D3)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | string | Generado por el store |
| `destinatarioRol` | administracion / propietario / residente / directiva / personal | |
| `destinatarioPersonaId?` | string | Si apunta a una persona concreta |
| `asunto`, `cuerpo` | string | |
| `canal` | `"email_simulado"` (único valor posible) | Sin SMTP real |
| `moduloOrigen` | string | Ej: `PI`, `AD`, `GD` |
| `fecha` | ISO | |
| `leida` | boolean | |

Tope: 500 registros (FIFO). Orígenes actuales: leads PI, alertas AD, publicación de actas GD.

---

## 🔐 Controles de Propiedad (0 registros)

Vacía por diseño: si una unidad no tiene registro, se asumen los defaults.

| Campo | Tipo | Default sin registro | Qué controla |
|-------|------|---------------------|--------------|
| `id` | string | — | Patrón: `ctrl-{unidadId}` |
| `unidadId` | string | — | Una fila por unidad |
| `residenteVeMorosidad` | boolean | `false` | El residente ve deuda de su unidad |
| `residenteVeActas` | boolean | `false` | El residente ve actas publicadas |
| `alertasResidentesActivas` | boolean | `true` | Recibir alertas del sistema |

---

## 📜 Actas GD (0 registros)

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | string | Patrón: `acta-{timestamp}` |
| `fecha` | ISO | Fecha de la reunión |
| `hora` | HH:MM | Regex estricta |
| `lugar` | string | |
| `tablaTemas[]` | string | Orden del día |
| `presentes[]`, `ausentes[]` | ids personas | Miembros directiva vigentes (con `datosGobernanza`) |
| `invitados[]` | string | Nombres libres |
| `minuta` | string | Cuerpo del acta |
| `adjuntos[]` | referencia | Escaneos por URL (D1) |
| `estado` | borrador / publicada | Publica al aprobar el 100% de la directiva |
| `aprobaciones[]` | ids personas | Firmas acumuladas |
| `fechaPublicacion?` | ISO | Se setea al publicar |
| `avisoCVReferencia?` | `"pendiente"` | Literal único hasta que exista CV |

Flujo: `saveActaGD` (borrador) → `aprobarActaGD` por cada miembro → quórum 100% → publica + notifica a propietarios + eventos `GD_ACTA_APPROVED`.

---

*Última actualización: 25 de Agosto 2026 — Sesión 1 NSGC (store v13)*
