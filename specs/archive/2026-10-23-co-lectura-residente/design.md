# Design: co-lectura-residente

## Marco de dominio

El dictamen del skill `experto-admin-comunidades` (2026-10-23) fija el criterio que este
diseño implementa. Los cuatro planos, resumidos:

| Plano | Qué aporta |
|---|---|
| **Ley** | Ley 19.628 art. 4: todo tratamiento exige autorización legal o consentimiento expreso e informado. La Ley 21.442 no crea derecho a ver datos ajenos: crea el **deber de informar** y de rendir cuenta (art. 21: ante el comité mensualmente y ante la asamblea en cada sesión ordinaria). Ley 21.719 entra en vigencia el **01-12-2026**; a la fecha de este change no rige, pero sus principios de licitud, finalidad y minimización son el estándar de diseño |
| **Reglamento** | No verificado. No se afirma nada reglamentario en este change |
| **Doctrina** | Solo Administración y Comité ven deudas; publicar nóminas al vecindario vulnera 19.628/21.719. Plazo ARCO 30+30 atribuido por doctrina, **no** verificado en el texto legal |
| **Criterio del proyecto** | Este documento: el residente ve lo suyo; el admin ve agregados; el desglose nominativo es del administrador, auditado y sin exportación |

## Decisiones

### D1 — La vista se deriva del rol de la sesión, no de un selector

Se elimina el estado `vista` y el `<Select>` de `app/comunidad/comunicacion/page.tsx`.
El rol se lee de la sesión server-side y decide qué componente se renderiza:

- `administrador` → consola actual (redacción, plantillas, buzón, biblioteca).
- `comite` → bandeja de lectura con agregados, sin redacción.
- `residente` → bandeja propia.

**Por qué:** D-2. Un toggle de cliente que gobierna el filtro de alcance es
autorización por UI, y la matriz ABAC del proyecto ya declara que el alcance se filtra
en el servidor (`auditoria-contratos-permisos`).

### D2 — El servidor decide qué campos ve cada rol

`GET /api/co/envios` y `GET /api/co/envios/[id]` responden distinto según el rol de la
sesión:

| Rol | Filtro de filas | `destinatarios[]` | `lecturas[]` | Totales |
|---|---|---|---|---|
| administrador | toda la comunidad | sí | sí | sí |
| comite | toda la comunidad | **no** | **no** | sí (`totalDestinatarios`, `totalLecturas`) |
| residente | solo donde es destinatario | **no** | **no** | **no** |

El residente recibe además `lecturaPropia: { leidoEn: string \| null }`, que es el único
dato de lectura que le pertenece.

Un residente que pide un envío ajeno recibe **404**, igual que el `POST /leer`: el 404 no
distingue «no existe» de «no es tuyo», así que no filtra existencia.

**Por qué:** D-1. Filtrar en el cliente no es filtrar; y la minimización es requisito
del dictamen.

### D3 — Modelo relacional `EnvioDestinatarioCO`

```prisma
model EnvioDestinatarioCO {
  id        String    @id
  envioId   String
  envio     EnvioCO   @relation(fields: [envioId], references: [id], onDelete: Cascade)
  personaId String
  unidadId  String?
  leidoEn   DateTime?
  createdAt DateTime  @default(now())

  @@unique([envioId, personaId])
  @@index([personaId])
  @@map("envio_destinatarios_co")
}
```

La tabla pasa a ser la **única fuente de verdad** de pertenencia y de estado de lectura.

- `EnvioCO.destinatarios` (Json) queda como **snapshot inmutable** de lo que el
  administrador envió, para trazabilidad; no se usa para decidir pertenencia.
- `EnvioCO.lecturas` (Json) queda **derivada**: se escribe desde la tabla en la misma
  transacción del alta, y un test verifica que ningún lector la use como fuente.

**Por qué:** hoy `lecturas` es un `string[]` en JSON y `POST /leer` hace
read-modify-write del array completo: dos lecturas concurrentes se pisan y una se pierde
(riesgo de concurrencia). Además, filtrar por pertenencia sobre un JSON obliga a filtrar
en memoria y rompe la paginación del factory (una página puede quedar vacía después de
filtrar).

### D4 — Separación de recursos en la matriz

| Recurso | administrador | comite | residente |
|---|---|---|---|
| `co` (difusión) | ver, crear, editar, eliminar | ver, crear | **ver** (solo propias, ABAC en la ruta) |
| `co:buzon` | ver, crear, editar | ver, crear | ver, crear |
| `co:lecturas` | ver | — | — |

`app/api/co/mensajes-buzon/route.ts` pasa de `co` a `co:buzon`.

Los tres recursos se declaran en `MATRIZ` de `lib/authz.ts`: el candado
`npm run audit:desvios` (R1) falla si el código usa un recurso ausente de la matriz.

**Por qué:** D-3. El residente escribe por el buzón ciudadano; no emite difusiones.

### D5 — Desglose nominativo reservado y auditado

`GET /api/co/envios/[id]/lecturas` (nuevo) devuelve
`[{ personaId, leidoEn }]` y **solo** responde al rol administrador. Cada consulta emite
`CO_LECTURA_CONSULTADA` con `envioId` y el rol que consultó. No hay endpoint de
exportación.

**Por qué:** decisión del owner. El detalle nominativo se justifica por la rendición de
cuentas del art. 21 ante comité/asamblea; el evento permite acreditar quién consultó la
lectura de los vecinos ante un reclamo de datos personales.

### D6 — Registro de lectura mínimo

Por lectura se guarda `envioId`, `personaId`, `leidoEn`. **No** se guarda RUT, IP,
user-agent, geolocalización ni el contenido duplicado.

Base de licitud declarada en pantalla: deber de informar (Ley 21.442) + autorización
legal/consentimiento (Ley 19.628 art. 4), con aviso previo visible. No se invoca la
excepción del art. 4 inc. 5 (uso interno de personas jurídicas) como base general: cubre
estadística interna, no seguimiento individual.

### D7 — El administrador sí puede registrar un reclamo a nombre de un vecino

En el buzón ciudadano, residente y comité solo pueden reportar por sí mismos: el
`reportantePersonaId` y el `reportanteNombre` se derivan de la sesión y el cuerpo del
pedido se ignora. El **administrador** es la excepción declarada: la consola CO registra
reclamos recibidos en la oficina a nombre de un vecino, así que su cuerpo sí se respeta,
validado contra la comunidad y con el nombre resuelto desde `Persona`.

**Por qué:** derivarlo del admin atribuiría todos los reclamos recibidos al administrador
y rompería el flujo real de la oficina. El escenario de la spec está redactado sobre el
residente, que es el actor que no puede falsificar identidad.

## Textos de UI

Los tres textos los fija el dictamen y se implementan literales:

1. Bajo cada mensaje de la bandeja:
   > «ℹ️ Al abrir esta comunicación se registra tu lectura (fecha y hora) para acreditar
   > que la Administración cumplió su deber de informar. Solo la Administración y el
   > Comité pueden ver estadísticas; ningún vecino ve tu lectura.»
2. Métrica del administrador:
   > «X/Y leídos. Dato estadístico de recepción del canal; no acredita conocimiento del
   > contenido ni constituye notificación legal por sí solo.»
3. Aviso de tratamiento (permanente en la bandeja):
   > «Responsable: Comunidad [nombre], a través de su Administración. Finalidad: informar
   > asuntos de la comunidad y acreditar entrega. Base: deber de informar (Ley 21.442) y
   > autorización legal/consentimiento (Ley 19.628 art. 4). Derechos: acceso,
   > rectificación, cancelación y oposición ante la Administración [canal]. Conservación:
   > [plazo que defina el owner].»

## Migración y backfill

1. `prisma/schema.prisma` (Postgres) **y** `prisma/schema.sqlite.prisma`: el modelo nuevo
   en ambos. El CI usa el schema SQLite (`--schema=prisma/schema.sqlite.prisma`); olvidar
   uno rompe los jobs.
2. Migración con backfill **idempotente** en SQL: insertar una fila por cada elemento de
   `destinatarios` (`personaId`, `unidadId`) y marcar `leidoEn` para cada `personaId`
   presente en `lecturas`. Debe poder correrse dos veces sin duplicar
   (`ON CONFLICT DO NOTHING` / `INSERT OR IGNORE` según motor) y no depende de la app.
3. Alta y edición de envíos: escriben la tabla y el snapshot dentro de una
   `$transaction`.
4. Un test verifica que, tras el backfill, el conteo de filas es igual a la suma de
   `destinatarios` y que cada `lecturas` quedó con su `leidoEn`.

**Riesgo aceptado:** la migración toca datos existentes. Por eso es aditiva (no borra
columnas en este change) y el backfill es re-ejecutable.

## Fuera de este change, declarado

- **TTL de conservación**: el dictamen pide un plazo y el reglamento no está verificado.
  Se declara «sin TTL por ahora» y queda como pregunta abierta del owner. No se inventa
  un número.
- **Borrar las columnas JSON**: se hace en un change posterior, cuando el backfill tenga
  una ventana de verificación en producción.
