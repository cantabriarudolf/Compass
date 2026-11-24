/**
 * _publicacion — el aviso in-app de un acta publicada (T4 de
 * `odd/tasks/un-camino-de-entrega.md`, S7 y S8).
 *
 * Por qué existe: la pantalla de directiva (`app/comunidad/directiva/page.tsx`)
 * afirma, para toda acta publicada, que la «notificación formal» salió a los
 * propietarios, y ningún código de GD escribía una `Notificacion`: el registro
 * afirmaba una comunicación que nunca ocurrió. Este módulo completa el acto —
 * el aviso in-app de cada propietario— cuando el acta queda publicada, por el
 * puente único (`avisar` de `lib/entrega/notificar.ts`), igual que los otros
 * diez avisos del sistema. Nada escribe `prisma.notificacion.create` acá (S1).
 *
 * ── Las reglas que están codificadas acá (no reinterpretar) ─────────────────
 *
 * 1. **El aviso sólo existe para un acta publicada.** `asegurarAvisosActaPublicada`
 *    es idempotente y se llama con el acta que la escritura acaba de devolver:
 *    si el acta no quedó publicada, no escribe nada. Por eso el llamador no
 *    tiene que decidir la condición — la regla vive en un solo lugar y las tres
 *    puertas que pueden dejar un acta publicada (POST del libro, PUT y el POST
 *    de firmas/`aprobar`) pasan por acá.
 * 2. **El destinatario es el dueño de registro de la comunidad.** El mismo
 *    criterio que la cobranza FI y la entrega del aviso de cobro: vínculo
 *    `rol: "propietario"` y ABIERTO (`fechaFin: null`) en `VinculoUnidad`. Se
 *    suma la condición que usan los alcances de envío (`app/api/co/alcance-masivo`):
 *    la persona tiene que tener la cuenta ACTIVA. Sin propietario con cuenta
 *    activa el aviso no se inventa: el acta se publica igual y no hay avisos.
 * 3. **El rol de la bandeja sale de los roles REALES de la persona.**
 *    `destinatarioRol` es `rolDeBandeja(Persona.roles)` —el mapeo de la bandeja,
 *    el mismo que usa el envío masivo de CO—, no una constante: un miembro de
 *    directiva entra como `directiva` y un propietario sin cargo como
 *    `residente`, que es el rol con el que su bandeja lo alcanza.
 * 4. **El aviso es de la comunidad, no de una unidad.** Se dirige a la persona
 *    (`destinatarioPersonaId`) sin `unidadId`: el acta es un acto de la
 *    comunidad y una persona puede ser dueña de más de una unidad. Por eso se
 *    avisa UNA vez por persona, aunque tenga varios vínculos.
 * 5. **El canal se declara, no se hereda (S2).** `canal` viaja explícito con
 *    `CANAL_NOTIFICACION_EMAIL_SIMULADO`; el puente escribe la constancia
 *    `visor`/`entregado` de cada aviso.
 * 6. **S8 — acá no sale correo.** El aviso es in-app únicamente: no se llama a
 *    `entregarPorCorreo` ni se agrega ningún envío real. La pantalla describe
 *    el canal que efectivamente se persiste.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 *
 * El id del aviso es determinista: `not-gd-<acta>-<persona>`. Republicar (el
 * upsert idempotente del libro) o editar un acta ya publicada vuelve a pasar
 * por acá, encuentra el aviso y no escribe NADA —ni el aviso ni una segunda
 * fila de entrega—: la entrega del visor es el hecho que prueba el aviso, así
 * que duplicarla declararía una entrega que no ocurrió. Es la misma disciplina
 * de id determinista que `notificarEnvioCO` (`not-co-<envío>-<persona>`).
 */
import type { Prisma } from "@prisma/client"
import { hoyISO } from "@/lib/date-utils"
import { avisar } from "@/lib/entrega/notificar"
import { rolDeBandeja } from "@/lib/co-notificacion-envio"
import {
  CANAL_NOTIFICACION_EMAIL_SIMULADO,
  ESTADO_CUENTA_ACTIVA,
} from "@/lib/schemas"

/** Módulo de origen con el que el aviso del libro de actas se identifica. */
export const MODULO_ORIGEN_GD = "GD"

/** Estado del acta que dispara el aviso (`EstadoActaSchema`, lib/schemas.ts). */
const ESTADO_ACTA_QE_AVISA = "publicada"

/** Rol del vínculo que identifica al dueño de registro de una unidad. */
const ROL_PROPIETARIO = "propietario"

/**
 * Fila mínima del acta que el aviso necesita: exactamente lo que la escritura
 * devuelve y lo que la bandeja cita (folio, fecha de la sesión y de publicación).
 */
export interface ActaPublicadaMin {
  readonly id: string
  readonly comunidadId: string
  readonly fecha: string
  readonly estado: string
  readonly folio: string | null
  readonly fechaPublicacion: string | null
}

/** Id determinista del aviso: un acta, un propietario, un aviso. */
export function idAvisoActa(actaId: string, personaId: string): string {
  return `not-gd-${actaId}-${personaId}`
}

/** Identificación del acta en el asunto y el cuerpo (el folio es la cita legal). */
function identificacionDelActa(acta: ActaPublicadaMin): string {
  return acta.folio
    ? `El acta ${acta.folio}`
    : `El acta de la sesión del ${acta.fecha}`
}

/** Asunto del aviso: nombra el folio del libro cuando el acta lo tiene. */
export function asuntoAvisoActa(acta: ActaPublicadaMin): string {
  return acta.folio
    ? `Acta ${acta.folio} publicada`
    : `Acta de la sesión del ${acta.fecha} publicada`
}

/** Cuerpo del aviso: qué acta, de qué sesión y desde cuándo está publicada. */
export function cuerpoAvisoActa(acta: ActaPublicadaMin, fecha: string): string {
  return `${identificacionDelActa(acta)}, de la sesión del ${acta.fecha}, quedó publicada el ${fecha}. Está disponible para su consulta en el libro de actas de la comunidad.`
}

/**
 * Escribe (idempotente) el aviso in-app de cada propietario con cuenta activa de
 * la comunidad y devuelve cuántos avisos se crearon.
 *
 * Entra en la transacción del llamador (S3b): el aviso y su constancia `visor`
 * se confirman con la escritura del acta, o no se confirman. No escribe nada si
 * el acta no está publicada, si no hay propietarios con cuenta activa o si el
 * aviso ya existe.
 */
export async function asegurarAvisosActaPublicada(
  tx: Prisma.TransactionClient,
  acta: ActaPublicadaMin
): Promise<number> {
  if (acta.estado !== ESTADO_ACTA_QE_AVISA) return 0

  const vinculos = await tx.vinculoUnidad.findMany({
    where: {
      comunidadId: acta.comunidadId,
      rol: ROL_PROPIETARIO,
      fechaFin: null,
    },
    select: { personaId: true },
  })
  const idsPropietarios = [...new Set(vinculos.map((v) => v.personaId))]
  if (idsPropietarios.length === 0) return 0

  // UNA vez por persona: una persona puede ser dueña de varias unidades.
  const propietarios = await tx.persona.findMany({
    where: {
      comunidadId: acta.comunidadId,
      id: { in: idsPropietarios },
      estadoCuenta: ESTADO_CUENTA_ACTIVA,
    },
    select: { id: true, roles: true },
    orderBy: { id: "asc" },
  })
  if (propietarios.length === 0) return 0

  const fecha = acta.fechaPublicacion ?? hoyISO()
  const asunto = asuntoAvisoActa(acta)
  const cuerpo = cuerpoAvisoActa(acta, fecha)

  let avisados = 0
  for (const propietario of propietarios) {
    const notificacionId = idAvisoActa(acta.id, propietario.id)
    // El aviso ya existe: republicar no duplica ni el aviso ni su entrega.
    const existente = await tx.notificacion.findFirst({
      where: { id: notificacionId, comunidadId: acta.comunidadId },
      select: { id: true },
    })
    if (existente) continue

    await avisar(tx, {
      notificacionId,
      comunidadId: acta.comunidadId,
      destinatarioRol: rolDeBandeja(propietario.roles),
      destinatarioPersonaId: propietario.id,
      asunto,
      cuerpo,
      canal: CANAL_NOTIFICACION_EMAIL_SIMULADO,
      moduloOrigen: MODULO_ORIGEN_GD,
      fecha,
    })
    avisados += 1
  }
  return avisados
}
