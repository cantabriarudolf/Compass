# Proposal: co-lectura-residente

## Contexto

El PR #11 hizo que la lectura de un envío de Comunicación con Vecinos (CO) fuera
**real**: `POST /api/co/envios/[id]/leer` valida server-side que quien registra la
lectura sea destinatario, y el botón «Simular lectura» del administrador se eliminó.
El endpoint quedó bien; lo que falta es el otro extremo del ciclo: **no hay dónde el
residente abra el mensaje**. Consecuencia medible: el badge «X/Y leídos» muestra 0
porque nadie puede leer.

Al auditar la superficie para construir esa pantalla aparecieron tres defectos que
hacen que F1 no sea «agregar una vista» sino **cerrar una fuga de datos y después
construir la bandeja**:

| # | Defecto | Evidencia |
|---|---|---|
| D-1 | El residente recibe **todos** los envíos de la comunidad, con el array `destinatarios[]` y el array `lecturas[]` completos | `lib/authz.ts:140` otorga `ver` sobre `co` al residente; `app/api/co/envios/route.ts` usa el factory genérico, que solo filtra por `comunidadId` |
| D-2 | El residente aterriza en la consola del administrador | `app/comunidad/comunicacion/page.tsx:83` inicializa `vista = "administrador"`; el `<Select>` de la línea 331 se renderiza sin condicionar por rol, y el filtro de alcance depende de ese toggle de cliente |
| D-3 | El residente puede **emitir difusiones masivas** a toda la comunidad | `lib/authz.ts:140` le otorga `crear` sobre `co`, y el buzón ciudadano comparte el mismo recurso |

D-1 y D-2 exponen **quién leyó qué**: la nómina de destinatarios y el estado de lectura
ajeno son exactamente los datos que el dictamen del skill `experto-admin-comunidades`
manda enmascarar (`openspec/PENDIENTES-FUNCIONALIDAD.md` F1, instrucción del owner
del 2026-10-23).

## Objetivo

Cerrar el ciclo de lectura de comunicaciones con la lectura real ocurriendo en pantalla,
sin que ningún residente vea datos de otros vecinos, y con el desglose nominativo
reservado al administrador y auditado.

## Alcance

**Dentro:**

1. Bandeja del residente en `/comunidad/comunicacion`, con la vista derivada del rol
   de la sesión en el servidor (se elimina el selector «Vista»).
2. Filtro por destinatario en `GET /api/co/envios` y `GET /api/co/envios/[id]`: el
   residente solo recibe sus envíos, y su respuesta no incluye `destinatarios[]` ni
   `lecturas[]` ni el total.
3. Modelo relacional de destinatarios y lecturas (`EnvioDestinatarioCO`), con backfill
   idempotente desde las columnas JSON existentes.
4. Separación de recursos: `co` (difusión) y `co:buzon` (buzón ciudadano), más
   `co:lecturas` para el desglose nominativo.
5. Desglose nominativo de lecturas solo para administrador, con evento
   `CO_LECTURA_CONSULTADA` y sin exportación masiva.
6. Textos informativos de tratamiento de datos en la pantalla del residente.

**Fuera:**

- SMTP real (F4) y `Notificacion.unidadId` (F5).
- Retirar el módulo QA/dev (F9).
- Notificaciones push o correo saliente: el canal sigue siendo el visor interno.
- Cambiar el contrato de entrada de la API (el POST sigue aceptando
  `destinatarios: DestinatarioEnvio[]`).

## Desbloquea

- **F1** de `openspec/PENDIENTES-FUNCIONALIDAD.md` pasa a «Hecho».
- El badge «X/Y leídos» empieza a medir algo real, que es la métrica de COM de AM.

## Riesgo

Alto. Toca autorización (D-1, D-3) y el modelo de datos de un módulo con registros
existentes (migración + backfill). Requiere TDD y verificación independiente.
