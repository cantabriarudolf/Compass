---
name: hermes-bastion
description: "Trigger: consultar la base de producción, ver datos reales de Compass, preguntarle a Hermes, entrar por el bastión, revisar si la tabla/columna existe en producción, verificar configuracion_global o entregas_notificacion en producción. Consulta read-only a la base de producción de Compass a través del bastión, cuando Neon no es alcanzable desde la máquina de trabajo."
license: MIT
allowed-tools: Bash
---

# Hermes — consultas a producción por el bastión

## Por qué existe

La base de producción de Compass (Neon, branch `production`) **no es alcanzable desde la máquina de
trabajo**: el host directo resuelve a IPv6 y la conexión muere en `ENETUNREACH`, y el pooler solo
entra por suerte. La vía soportada es el **bastión**: se entra a su consola y ahí se escribe
`hermes chat`.

Esto es solo para **consultas**. No se escribe, no se migra y no se toca el esquema de producción
desde acá: para eso están el job `esquema` del CI (que aplica `db push` solo con diffs aditivos) y
`prisma db push` explícito con autorización del owner.

## Cuándo usarlo

- Hace falta saber si una tabla o columna **existe en producción** (por ejemplo `entregas_notificacion`).
- Hay que ver datos reales: `configuracion_global` (SMTP, casilla de recepción, compuertas), cola de CO,
  conteos de unidades/personas/cobros, filas de `entregas_notificacion` de un evento.
- Hay que confirmar qué quedó después de un deploy.

**No** usarlo para: escribir, borrar, migrar, correr seeds, ni para leer secretos.

## Cómo se entra

1. Se abre la **consola del hosting de `condominiolosalmendros`** (el panel del proveedor, no Vercel y no Neon).
2. Dentro de esa consola se escribe `hermes chat`.
3. Desde ahí se hacen las consultas.

Si `hermes chat` no existe, o no hay consola, **falta el acceso**: no se inventa un host ni una clave. Se
reporta el comando exacto que se intentó y se le pide al owner que lo habilite.

## Credenciales: se usan, no se leen

La regla es que el secreto **nunca pasa por la conversación** y **nunca queda en el repo**. Vive en un
archivo local fuera del árbol, con permisos 600:

```
~/.config/compass/hermes.env     # chmod 600, jamás commiteado
  HERMES_PANEL_URL=...
  HERMES_USER=...
  HERMES_SECRET=...      # password o token, según el panel
```

Cómo lo usa el agente:

- **Nunca** `cat`, `less`, `grep`, `echo` ni `head` sobre ese archivo, ni `env` que lo expanda.
- Se carga **en la misma subshell** del comando que lo necesita, y la salida se filtra:

```bash
set -a; . ~/.config/compass/hermes.env; set +a
# ... comando que usa $HERMES_SECRET ...
unset HERMES_SECRET
```

- **Nunca** el secreto como argumento en la línea de comandos (queda en `ps` y en el historial).
- Si un comando falla, el error se reporta **sin** transcribir el valor.
- El owner deja el archivo; el agente lo crea vacío con `install -m 600 /dev/null` y se lo pide para
  que lo complete él, o lo copia desde su gestor **sin imprimirlo**.

> **Pendiente de completar por el owner** (nada de esto está verificado en esta máquina): proveedor y URL
> del panel del hosting, y si la consola acepta `hermes chat` tal cual o hay que autenticarse antes.

## Reglas

1. **Read-only.** Solo `select`, `\d`, `\dt`, `explain`. Nada de `insert`, `update`, `delete`, `alter`,
   `drop`, `truncate`, `create`, ni `prisma` con `--accept-data-loss`.
2. **Sin secretos.** Nunca seleccionar `DATABASE_URL`, `AUTH_SECRET`, `CLAVE_*`, `TOKEN*`, `password`.
   Si una consulta los devuelve, se descarta el resultado y se reporta sin transcribirlo.
3. **Minimización.** Para datos de personas se piden ids y conteos, no RUT, correo ni teléfono. Si hace
   falta verificar un correo, alcanza con `count(*) filter (where email is not null and email <> '')`.
4. **Cada respuesta dice el contexto**: la consulta, la base y la hora. Un número sin de dónde salió no
   es evidencia.
5. **Si falla**, se reporta el error real (`ENETUNREACH`, `ETIMEDOUT`, `permission denied`) y no se
   reintenta a ciegas ni se prueba otra vía sin avisar.

## Consultas de Compass que ya están escritas

Nombre real de las columnas: Prisma las crea en **camelCase** y entre comillas.

```sql
-- ¿la tabla del puente de entrega existe en producción?
select to_regclass('public.entregas_notificacion') is not null as existe;

-- ¿qué corrió en un evento? (las últimas entregas, sin datos personales)
select "creadoEn", canal, estado, motivo, "destinatarioRol", "personaId", "notificacionId"
from entregas_notificacion
order by "creadoEn" desc
limit 20;

-- config por comunidad: ¿manda correo? ¿tiene casilla de recepción? ¿las compuertas están prendidas?
select "comunidadId",
       ("smtpHost" is not null and "smtpHost" <> '') as con_smtp,
       ("smtpRecepcion" is not null and "smtpRecepcion" <> '') as con_casilla,
       "notificarRegistroVisitas" as avisa_visitas,
       "notificarEncomiendas" as avisa_encomiendas
from configuracion_global;

-- estado de la cola de salida de CO
select estado, count(*) from cola_salida_co group by 1 order by 1;
```

## Lo que se aprendió midiendo

- El branch de producción en Neon es `production` (`br-misty-union-a5tgdtx5`) y es el **default**; hay
  un branch `dev` y otro `pre-limpieza`.
- Vercel **no expone** los valores de entorno marcados como Secret: `vercel env pull` devuelve
  `DATABASE_URL=[SENSITIVE]`. Por eso el bastión, no `vercel env pull`.
- `neonctl connection-string` sin `--pooled` devuelve el host directo (IPv6): inútil desde acá.
- Al 2026-11-25 producción **no tenía** `entregas_notificacion`: el puente no estaba desplegado.
