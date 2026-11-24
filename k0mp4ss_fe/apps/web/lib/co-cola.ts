/**
 * co-cola — la cola de salida del correo de las difusiones masivas de CO
 * (S2/S3/S4/S6).
 *
 * Por qué existe: el envío masivo no puede mandar correo dentro de la request de
 * negocio. La acción guarda y un proceso envía (S2, decisión del owner del
 * 2026-10-21). Este módulo concentra las dos mitades de ese contrato:
 *
 *   1. **encolarEnvioCO** — el alta del envío agrega una fila por destinatario,
 *      en la MISMA `$transaction` que escribe el envío y su nómina. Acá no se
 *      manda nada: sólo se guarda. El índice único `(envioId, personaId)` es la
 *      idempotencia — volver a mandar el mismo envío no duplica filas ni
 *      reescribe las que ya salieron.
 *   2. **drenarColaSalidaCO** — drena UN lote acotado y escribe el desenlace real
 *      de cada fila. Sin `setInterval` y sin envío al importar el módulo: si
 *      nadie invoca el drenaje, no sale un solo correo (S6).
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ─────────────────
 *
 * - **El envío sale por el puente único (S1).** Cada fila pasa por
 *   `entregarPorCorreo` de `lib/entrega/notificar.ts`, con el cliente PLANO
 *   (`prisma`) y nunca dentro de una transacción: el diálogo SMTP no retiene el
 *   lock de la base (S3b). El puente resuelve la dirección con la definición
 *   única (`lib/personas-contacto.ts`), aplica `planDeCanal` con la credencial de
 *   la comunidad (`lib/smtp.ts` → F33) y escribe la constancia compartida
 *   `entregas_notificacion`, colgada del aviso in-app del envío (S3). Este módulo
 *   no resuelve credenciales ni habla SMTP.
 * - **La cola y la constancia dicen lo mismo.** El estado de la fila es el que
 *   devolvió el puente (`enviado` | `pendiente` | `fallido`) y `enviadoEn` es la
 *   fecha REAL del envío que registró el puente, `null` en todo lo demás. Un
 *   intento deja UNA fila compartida; el reintento es otra fila, nunca la misma
 *   reescrita.
 * - **Sin emisor no se finge un envío (S3).** `planDeCanal` devuelve `pendiente`
 *   con `MOTIVO_SIN_SMTP` sin abrir ninguna conexión: la fila queda en la cola y
 *   la consola la cuenta como pendiente.
 * - **Estados honestos (S4).** `enviado` SOLO si el servidor SMTP aceptó el
 *   mensaje; `fallido` con el motivo (del servidor o el rechazo local del
 *   destinatario); NUNCA `entregado` — esa palabra es del visor, que prueba su
 *   hecho con una `Notificacion`. `enviadoEn` se fecha únicamente al enviar.
 * - **Reintentar suma, no borra.** Un `fallido` se vuelve a tomar hasta
 *   `MAX_INTENTOS_COLA_SALIDA_CO`; cada intento real incrementa `intentos` y
 *   `ultimoError` guarda el motivo del último desenlace. Un `pendiente` NO
 *   incrementa: sin emisor no hubo intento (no se abrió conexión). Un enviado no
 *   se vuelve a tomar: la fila deja de ser candidata.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { generarId } from "@/lib/id-utils"
import { entregarPorCorreo } from "@/lib/entrega/notificar"
import { idNotificacionEnvioCO } from "@/lib/co-notificacion-envio"
import { ESTADOS_ENVIO_SMTP, type EstadoEnvioSMTP } from "@/lib/schemas"

/**
 * Los tres estados de la cola: la MISMA referencia que el subconjunto de envío del
 * catálogo (`ESTADOS_ENVIO_SMTP`), importada y no copiada. `entregado` no es uno de
 * ellos (S4): la cola registra intentos de correo, y la entrega la prueba la
 * `Notificacion` del visor.
 */
export const ESTADOS_COLA_SALIDA_CO = ESTADOS_ENVIO_SMTP
export type EstadoColaSalidaCO = EstadoEnvioSMTP

/**
 * Tope de intentos reales por fila. Un `fallido` se vuelve a tomar en el drenaje
 * siguiente hasta llegar acá; después queda como falla declarada en la métrica,
 * sin reintentos infinitos contra un servidor que rebota.
 */
export const MAX_INTENTOS_COLA_SALIDA_CO = 3

/** Lote por omisión y tope por invocación (S6): el proceso nunca drena "todo". */
export const LOTE_COLA_SALIDA_CO_POR_DEFECTO = 25
export const LOTE_COLA_SALIDA_CO_MAXIMO = 50

/** Lo que el alta del envío necesita para encolar a sus destinatarios. */
export interface EnvioAEncolar {
  comunidadId: string
  envioId: string
  asunto: string
  cuerpo: string
  destinatarios: ReadonlyArray<{ personaId: string }>
}

/**
 * Encola una fila de correo por destinatario, dentro de la transacción que abre
 * el llamador.
 *
 * - El correo sale del Maestro de Personas de la comunidad. Una persona sin
 *   correo (o un destinatario que ya no existe) entra con `destinatario` null:
 *   el drenaje lo declara `fallido` con el motivo, en vez de inventar una
 *   dirección. No se omite la fila: la falta es un hecho que hay que ver.
 * - `upsert` con `update: {}`: reenviar el mismo alta NO duplica ni reescribe.
 *   Una fila que ya salió conserva su estado, sus intentos y su fecha.
 */
export async function encolarEnvioCO(
  tx: Prisma.TransactionClient,
  datos: EnvioAEncolar
): Promise<void> {
  const personaIds = [...new Set(datos.destinatarios.map((d) => d.personaId))]
  if (personaIds.length === 0) return

  const personas = await tx.persona.findMany({
    where: { comunidadId: datos.comunidadId, id: { in: personaIds } },
    select: { id: true, email: true },
  })
  const correoPorPersona = new Map(personas.map((p) => [p.id, p.email.trim()]))

  for (const personaId of personaIds) {
    const correo = correoPorPersona.get(personaId) ?? ""
    await tx.colaSalidaCO.upsert({
      where: { envioId_personaId: { envioId: datos.envioId, personaId } },
      create: {
        id: generarId("cs"),
        comunidadId: datos.comunidadId,
        envioId: datos.envioId,
        personaId,
        destinatario: correo === "" ? null : correo,
        asunto: datos.asunto,
        cuerpo: datos.cuerpo,
      },
      update: {},
    })
  }
}

/** Filtro de la cola: siempre la comunidad de la sesión; opcionalmente un envío. */
export interface FiltroColaSalidaCO {
  comunidadId: string
  envioId?: string
}

/** La métrica honesta (S5): enviados, fallidos y pendientes. Nunca aperturas. */
export interface ResumenColaSalidaCO {
  enviados: number
  fallidos: number
  pendientes: number
  /** Motivo del último `fallido`; null si no hay ninguna falla registrada. */
  ultimoError: string | null
}

/** Lo que devuelve una invocación del drenaje: el lote y el saldo (S6). */
export interface ResultadoDrenajeColaSalidaCO {
  tomadas: number
  enviadas: number
  fallidas: number
  /** Cuántas quedan pendientes después del lote. */
  pendientes: number
  totales: ResumenColaSalidaCO
  ultimoError: string | null
}

/** Filtro Prisma de la cola, con `envioId` sólo cuando se pidió uno. */
function whereDeCola(filtro: FiltroColaSalidaCO): Prisma.ColaSalidaCOWhereInput {
  return {
    comunidadId: filtro.comunidadId,
    ...(filtro.envioId === undefined ? {} : { envioId: filtro.envioId }),
  }
}

/**
 * Acota el lote pedido por el llamador: entero ≥ 1, tope
 * `LOTE_COLA_SALIDA_CO_MAXIMO`. Un valor ausente o ilegible cae al de omisión;
 * un número mayor al tope se recorta, nunca se rechaza (pedir de más no puede
 * convertir una invocación en un envío masivo sin límite).
 */
export function acotarLoteColaSalidaCO(limite: unknown): number {
  const numero =
    typeof limite === "number"
      ? limite
      : typeof limite === "string"
        ? Number.parseInt(limite, 10)
        : Number.NaN
  if (!Number.isFinite(numero) || numero < 1) return LOTE_COLA_SALIDA_CO_POR_DEFECTO
  return Math.min(LOTE_COLA_SALIDA_CO_MAXIMO, Math.floor(numero))
}

/** Cuenta los estados de la cola y devuelve el motivo de la última falla. */
export async function resumenColaSalidaCO(
  filtro: FiltroColaSalidaCO
): Promise<ResumenColaSalidaCO> {
  const where = whereDeCola(filtro)
  const [enviados, fallidos, pendientes, ultimaFalla] = await Promise.all([
    prisma.colaSalidaCO.count({ where: { ...where, estado: "enviado" } }),
    prisma.colaSalidaCO.count({ where: { ...where, estado: "fallido" } }),
    prisma.colaSalidaCO.count({ where: { ...where, estado: "pendiente" } }),
    prisma.colaSalidaCO.findFirst({
      where: { ...where, estado: "fallido" },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      select: { ultimoError: true },
    }),
  ])
  return { enviados, fallidos, pendientes, ultimoError: ultimaFalla?.ultimoError ?? null }
}

/**
 * Drena UN lote acotado: toma los `pendiente` (y los `fallido` que todavía
 * tienen intentos disponibles), intenta cada envío por el puente único
 * (`entregarPorCorreo`, cliente plano, fuera de toda transacción) y escribe el
 * desenlace real en la fila Y en la constancia compartida.
 *
 * El lote se procesa de a uno: la conversación SMTP es serial, no se abre una
 * conexión por fila en paralelo. Los envíos ya escritos no se tocan si el
 * llamado se corta a la mitad: cada desenlace se persiste en su fila.
 *
 * Orden de las dos escrituras: el puente persiste la constancia del correo y
 * DESPUÉS se actualiza la fila de la cola, igual que antes (el diálogo SMTP no
 * puede ir dentro de una transacción, S3b). Si la actualización de la cola
 * fallara tras un envío aceptado, queda la constancia que lo prueba y la fila
 * se vuelve a intentar en el drenaje siguiente: es la misma ventana que la cola
 * ya tenía, ahora con evidencia.
 */
export async function drenarColaSalidaCO(
  filtro: FiltroColaSalidaCO & { limite?: unknown }
): Promise<ResultadoDrenajeColaSalidaCO> {
  const limite = acotarLoteColaSalidaCO(filtro.limite)
  const filas = await prisma.colaSalidaCO.findMany({
    where: {
      ...whereDeCola(filtro),
      estado: { in: ["pendiente", "fallido"] },
      intentos: { lt: MAX_INTENTOS_COLA_SALIDA_CO },
    },
    orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
    take: limite,
  })

  // El aviso in-app de cada fila lo escribió el alta (`not-co-<envío>-<persona>`).
  // Se resuelve de una sola consulta por lote: el intento de correo se cuelga de
  // SU aviso cuando existe y queda con `notificacionId: null` cuando no —el
  // drenaje no inventa notificaciones ni falla por un aviso ausente (S3b)—.
  const conAviso = new Set(
    filas.length === 0
      ? []
      : (
          await prisma.notificacion.findMany({
            where: {
              comunidadId: filtro.comunidadId,
              id: { in: filas.map((f) => idNotificacionEnvioCO(f.envioId, f.personaId)) },
            },
            select: { id: true },
          })
        ).map((n) => n.id)
  )

  let enviadas = 0
  let fallidas = 0
  let ultimoError: string | null = null

  for (const fila of filas) {
    const avisoId = idNotificacionEnvioCO(fila.envioId, fila.personaId)
    // S1/S3b: el correo sale por el puente con el cliente PLANO, fuera de toda
    // transacción. La dirección la resuelve la definición única por persona, no
    // el snapshot de la cola (que queda como lo que se encoló).
    const entrega = await entregarPorCorreo(prisma, {
      comunidadId: filtro.comunidadId,
      asunto: fila.asunto,
      cuerpo: fila.cuerpo,
      personaDelCorreo: fila.personaId,
      notificacionId: conAviso.has(avisoId) ? avisoId : null,
    })
    // `pendiente` es una condición de configuración, no un intento: no consume
    // el contador ni fecha un envío que no salió (S3/S4).
    const intentoReal = entrega.estado !== "pendiente"
    await prisma.colaSalidaCO.update({
      where: { id: fila.id },
      data: {
        estado: entrega.estado,
        ...(intentoReal ? { intentos: { increment: 1 } } : {}),
        ultimoError: entrega.motivo,
        // La fecha del envío es la que registró el puente: `null` salvo
        // `enviado` (no se fecha un correo que no salió).
        enviadoEn: entrega.enviadoEn,
      },
    })
    if (entrega.estado === "enviado") {
      enviadas += 1
    } else if (entrega.estado === "fallido") {
      fallidas += 1
      ultimoError = entrega.motivo
    }
  }

  const totales = await resumenColaSalidaCO(filtro)
  return {
    tomadas: filas.length,
    enviadas,
    fallidas,
    pendientes: totales.pendientes,
    totales,
    // El motivo del lote manda (es el más reciente); si no hubo fallas acá, se
    // reporta la última falla conocida de la cola.
    ultimoError: ultimoError ?? totales.ultimoError,
  }
}
