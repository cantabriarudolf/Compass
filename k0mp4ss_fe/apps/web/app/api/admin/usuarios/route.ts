import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { normalizaRol, puede, ROLES, type Rol } from "@/lib/authz"
import { ROLES_CON_ALCANCE_DE_COMUNIDAD } from "@/lib/api/sesion-persona"
import { logger } from "@/lib/logger"
import { randomUUID } from "node:crypto"
import { registrarEventoAuditoria } from "@/lib/auditoria"
import {
  CATEGORIA_AUDITORIA_CUENTAS,
  crearInvitacionDeAcceso,
  invitacionPublica,
} from "@/lib/invitacion-acceso"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/usuarios
 * - SIN comunidadId: comunidades donde el usuario autenticado tiene membresía
 *   ({ comunidades: [{ id, nombre, rol }] }) — sin datos de terceros (RP /admin/permisos).
 * - CON comunidadId (query ?comunidadId= o header x-comunidad-id): lista membresías +
 *   usuarios de esa comunidad.
 * Autorización server-side (SG §4.1): proxy solo autentica, aquí se decide puede(rol, ver, admin:usuarios).
 * Sesión vía Auth.js: sub = Usuario.id en BD (AU §3 P5).
 */
export async function GET(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const comunidadId =
    url.searchParams.get("comunidadId") ??
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId")

  const usuario = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!usuario || !usuario.activo) {
    return NextResponse.json({ error: "Usuario no encontrado o inactivo" }, { status: 401 })
  }

  // Rama sin comunidadId: comunidades propias (vista /admin/permisos, solo lectura)
  if (!comunidadId || typeof comunidadId !== "string" || comunidadId.trim().length === 0) {
    const propias = await prisma.membresia.findMany({
      where: { usuarioId: usuario.id },
      include: { comunidad: true },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({
      comunidades: propias.map((m: (typeof propias)[number]) => ({
        id: m.comunidadId,
        nombre: m.comunidad.nombre,
        rol: m.rol,
      })),
    })
  }

  const cid = comunidadId.trim()

  // Verifica que la comunidad existe (D3 tenant existe)
  const comunidad = await prisma.comunidad.findUnique({ where: { id: cid } })
  if (!comunidad) {
    return NextResponse.json({ error: "Comunidad no encontrada" }, { status: 404 })
  }

  const membresia = await prisma.membresia.findFirst({
    where: { usuarioId: usuario.id, comunidadId: cid },
  })

  if (!membresia) {
    return NextResponse.json({ error: "Sin pertenencia a la comunidad" }, { status: 403 })
  }

  if (!puede(membresia.rol, "ver", "admin:usuarios")) {
    // RP Menor privilegio → RP_PERMISSION_DENIED (AM) — se loguea server side
    // P3: sin PII en logs — identificamos por usuario.id, nunca email.
    logger.warn({ event: "RP_PERMISSION_DENIED", usuarioId: usuario.id, rol: membresia.rol, recurso: "admin:usuarios", comunidadId: cid }, "[authz] RP_PERMISSION_DENIED admin:usuarios")
    return NextResponse.json({ error: "Permiso denegado. Requiere rol administrador." }, { status: 403 })
  }

  // Scoping obligatorio via comunidadId (D3) — solo datos de esa comunidad (C1b)
  const membresias = await prisma.membresia.findMany({
    where: { comunidadId: cid },
    include: { usuario: true },
    orderBy: { createdAt: "asc" },
  })

  // Estado de la invitación de cada cuenta (lo muestra la pantalla de cuentas): la
  // última emitida, siempre por `invitacionPublica`, que es la única proyección que
  // conoce esta ruta y no tiene token ni hash.
  const usuarioIds = membresias.map(
    (m: (typeof membresias)[number]) => m.usuarioId
  )
  const invitaciones = usuarioIds.length
    ? await prisma.invitacionAcceso.findMany({
        where: { comunidadId: cid, usuarioId: { in: usuarioIds } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      })
    : []
  const ultimaInvitacion = new Map<string, (typeof invitaciones)[number]>()
  for (const invitacion of invitaciones) {
    if (!ultimaInvitacion.has(invitacion.usuarioId)) {
      ultimaInvitacion.set(invitacion.usuarioId, invitacion)
    }
  }

  return NextResponse.json({
    comunidadId: cid,
    comunidadNombre: comunidad.nombre,
    total: membresias.length,
    membresias: membresias.map((m: (typeof membresias)[number]) => {
      const invitacion = ultimaInvitacion.get(m.usuarioId)
      return {
        id: m.id,
        rol: m.rol,
        comunidadId: m.comunidadId,
        usuario: {
          id: m.usuario.id,
          email: m.usuario.email,
          personaId: m.usuario.personaId,
          activo: m.usuario.activo,
        },
        invitacion: invitacion ? invitacionPublica(invitacion) : null,
      }
    }),
  })
}

/** Conflicto de alta (persona o correo ya tomados). Se lanza dentro de la transacción
 *  para que el rechazo no deje cuenta, membresía ni invitación a medias (S3). */
class ConflictoAlta extends Error {}

/** Forma mínima de un correo utilizable como credencial; la base no valida formato. */
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/admin/usuarios — el alta de una cuenta, en un solo acto (F42 · S1/S3/S4).
 *
 * Quién: sólo un `administrador` de la comunidad de la sesión (`puede(rol, "crear",
 * "admin:usuarios")`), igual que el resto de la ruta.
 * Qué: persona del padrón de ESA comunidad + rol + membresía + invitación, en una
 * transacción. Sin persona no hay cuenta (S1): no existe cuenta anónima que auditar.
 * Cómo entra la persona: por un enlace de un solo uso. La cuenta nace con
 * `passwordHash` nulo, así que el login la rechaza hasta que consuma la invitación;
 * esta ruta NUNCA devuelve el token ni su hash, y tampoco el administrador lo ve (S4).
 */
export async function POST(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const comunidadId =
    url.searchParams.get("comunidadId") ??
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId")

  if (
    !comunidadId ||
    typeof comunidadId !== "string" ||
    comunidadId.trim().length === 0
  ) {
    return NextResponse.json({ error: "comunidadId requerido" }, { status: 400 })
  }
  const cid = comunidadId.trim()

  const actor = await prisma.usuario.findUnique({ where: { id: sesion.user.id } })
  if (!actor || !actor.activo) {
    return NextResponse.json(
      { error: "Usuario no encontrado o inactivo" },
      { status: 401 }
    )
  }

  const comunidad = await prisma.comunidad.findUnique({ where: { id: cid } })
  if (!comunidad) {
    return NextResponse.json({ error: "Comunidad no encontrada" }, { status: 404 })
  }

  const membresiaActor = await prisma.membresia.findFirst({
    where: { usuarioId: actor.id, comunidadId: cid },
  })
  if (!membresiaActor) {
    return NextResponse.json(
      { error: "Sin pertenencia a la comunidad" },
      { status: 403 }
    )
  }

  if (!puede(membresiaActor.rol, "crear", "admin:usuarios")) {
    logger.warn(
      {
        event: "RP_PERMISSION_DENIED",
        usuarioId: actor.id,
        rol: membresiaActor.rol,
        recurso: "admin:usuarios",
        accion: "crear",
        comunidadId: cid,
      },
      "[authz] RP_PERMISSION_DENIED admin:usuarios"
    )
    return NextResponse.json(
      { error: "Permiso denegado. Requiere rol administrador." },
      { status: 403 }
    )
  }

  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }
  const datos = (
    cuerpo !== null && typeof cuerpo === "object" ? cuerpo : {}
  ) as Record<string, unknown>

  const personaId =
    typeof datos.personaId === "string" ? datos.personaId.trim() : ""
  if (!personaId) {
    return NextResponse.json({ error: "personaId requerido" }, { status: 400 })
  }

  // Misma normalización y mismo rechazo que el PATCH: el alta no puede ser la única
  // puerta que acepta alias que el resto del sistema sí acepta, ni un rol que la
  // matriz de permisos no conoce.
  const rolNormalizado = normalizaRol(
    typeof datos.rol === "string" ? datos.rol : ""
  )
  if (!rolNormalizado || !ROLES.includes(rolNormalizado)) {
    return NextResponse.json({ error: "Rol desconocido." }, { status: 400 })
  }

  // Coherencia rol ↔ persona (la regla que el PATCH hace cumplir al conceder un rol):
  // un rol acotado por fila sin ficha no puede ejercer nada, porque los `_alcance.ts`
  // fallan cerrado. En el alta la ficha es obligatoria para CUALQUIER rol (S1: no hay
  // cuenta anónima), así que el estado que el PATCH rechaza no puede entrar por acá:
  // la persona se valida contra el padrón de la comunidad antes de crear la cuenta.
  const persona = await prisma.persona.findFirst({
    where: { id: personaId, comunidadId: cid },
  })
  if (!persona) {
    // El mismo 404 para persona inexistente y para persona de otra comunidad: no se
    // cuenta qué existe fuera del tenant de la sesión.
    return NextResponse.json(
      { error: "Persona no encontrada en la comunidad." },
      { status: 404 }
    )
  }

  // El correo de la cuenta es el de la ficha, salvo que el alta indique otro: la
  // persona puede tener un correo de contacto que no sea su buzón de ingreso.
  const correoBruto =
    typeof datos.email === "string" && datos.email.trim().length > 0
      ? datos.email
      : persona.email
  const email = correoBruto.trim().toLowerCase()
  if (!CORREO_RE.test(email)) {
    return NextResponse.json({ error: "Correo inválido." }, { status: 400 })
  }

  let creado: {
    usuario: {
      id: string
      email: string
      personaId: string | null
      activo: boolean
    }
    membresiaId: string
    invitacion: ReturnType<typeof invitacionPublica>
  }

  try {
    creado = await prisma.$transaction(async (tx) => {
      // La persona primero: si ya tiene cuenta, el rechazo dice lo que de verdad pasa.
      const cuentaDeLaPersona = await tx.usuario.findFirst({
        where: { personaId },
        select: { id: true },
      })
      if (cuentaDeLaPersona) throw new ConflictoAlta("La persona ya tiene una cuenta.")

      const cuentaDelCorreo = await tx.usuario.findUnique({
        where: { email },
        select: { id: true },
      })
      if (cuentaDelCorreo) throw new ConflictoAlta("Ya existe una cuenta con ese correo.")

      const usuario = await tx.usuario.create({
        data: { email, personaId, activo: true },
      })
      const membresia = await tx.membresia.create({
        data: {
          usuarioId: usuario.id,
          comunidadId: cid,
          rol: rolNormalizado,
        },
      })

      // S3: cuenta, membresía, invitación y rastro caen o suben juntos. El token en
      // claro muere acá —no se devuelve— y lo transportará el correo de F43 / T2.
      const { invitacion } = await crearInvitacionDeAcceso({
        usuarioId: usuario.id,
        comunidadId: cid,
        creadoPor: actor.id,
        client: tx,
      })

      await registrarEventoAuditoria(
        {
          id: randomUUID(),
          comunidadId: cid,
          timestamp: new Date().toISOString(),
          usuario: actor.id,
          categoria: CATEGORIA_AUDITORIA_CUENTAS,
          tipoAccion: "cuenta_creada",
          referenciaId: usuario.id,
          descripcion: `Alta de cuenta con invitación de un solo uso para la persona ${personaId}, con rol ${rolNormalizado}.`,
        },
        tx
      )

      return {
        usuario: {
          id: usuario.id,
          email: usuario.email,
          personaId: usuario.personaId,
          activo: usuario.activo,
        },
        membresiaId: membresia.id,
        invitacion,
      }
    })
  } catch (error) {
    if (error instanceof ConflictoAlta) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }

  // Sólo estado: ni token, ni hash, ni `passwordHash` en la respuesta.
  return NextResponse.json(
    {
      ok: true,
      usuario: creado.usuario,
      membresia: {
        id: creado.membresiaId,
        comunidadId: cid,
        rol: rolNormalizado,
      },
      invitacion: creado.invitacion,
    },
    { status: 201 }
  )
}

/**
 * PATCH /api/admin/usuarios
 * Actualiza un usuario (rol o estado activo). Requiere admin.
 * SERIE-PRODUCCION-FASE2 P2: incrementa tokenVersion al cambiar rol o desactivar,
 * invalidando sesiones activas del usuario.
 */
export async function PATCH(request: NextRequest) {
  const sesion = await auth()
  if (!sesion?.user?.id) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 })
  }

  const url = new URL(request.url)
  const comunidadId =
    url.searchParams.get("comunidadId") ??
    request.headers.get("x-comunidad-id") ??
    request.headers.get("x-comunidadId")

  if (!comunidadId || typeof comunidadId !== "string") {
    return NextResponse.json({ error: "comunidadId requerido" }, { status: 400 })
  }

  const cid = comunidadId.trim()
  const adminMembresia = await prisma.membresia.findFirst({
    where: { usuarioId: sesion.user.id, comunidadId: cid },
  })

  if (!adminMembresia || !puede(adminMembresia.rol, "editar", "admin:usuarios")) {
    return NextResponse.json({ error: "Permiso denegado" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
  }

  const usuarioId = String(body.usuarioId ?? "")
  if (!usuarioId) {
    return NextResponse.json({ error: "usuarioId requerido" }, { status: 400 })
  }

  // Verificar que el usuario pertenece a la comunidad
  const membresia = await prisma.membresia.findFirst({
    where: { usuarioId, comunidadId: cid },
  })
  if (!membresia) {
    return NextResponse.json({ error: "Usuario no pertenece a la comunidad" }, { status: 404 })
  }

  const cambiaRol = typeof body.rol === "string"
  const cambiaActivo = typeof body.activo === "boolean"

  if (cambiaRol) {
    // Decisión 2026-11-07 (D2 de «Permisos por objeto»): la ficha de persona sigue
    // siendo opcional en la columna —Auth.js crea el usuario antes de saber quién es—
    // pero un rol ACOTADO POR FILA no puede quedar sin ficha: sin `personaId` los
    // `_alcance.ts` fallan cerrado y el usuario no ve nada, así que el sistema le
    // estaría dando un rol que no puede ejercer. Se rechaza acá, donde se concede.
    // Se normaliza igual que en la lectura: `normalizaRol` acepta los alias que el
    // resto del sistema acepta ("Comité" → "comite", "admin" → "administrador").
    // Sin esto, el PATCH sería la única puerta del repo que rechaza un alias válido.
    const rolNormalizado = normalizaRol(String(body.rol))
    if (!rolNormalizado) {
      return NextResponse.json({ error: "Rol desconocido." }, { status: 400 })
    }
    const nuevoRol: Rol = rolNormalizado
    if (!ROLES.includes(nuevoRol)) {
      return NextResponse.json({ error: "Rol desconocido." }, { status: 400 })
    }
    if (!ROLES_CON_ALCANCE_DE_COMUNIDAD.has(nuevoRol)) {
      const destino = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { personaId: true },
      })
      if (!destino?.personaId) {
        return NextResponse.json(
          {
            error:
              "Un rol operativo necesita ficha de persona: sin ella el alcance por fila le niega todo. Asigná la persona antes del rol.",
          },
          { status: 400 }
        )
      }
    }
    await prisma.membresia.update({
      where: { id: membresia.id },
      data: { rol: nuevoRol },
    })
  }

  if (cambiaActivo) {
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { activo: Boolean(body.activo) },
    })
  }

  // P2: invalidar sesiones si cambió rol o desactivó
  if (cambiaRol || (cambiaActivo && body.activo === false)) {
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { tokenVersion: { increment: 1 } },
    })
    logger.info({ event: "SESSION_INVALIDATED", usuarioId, adminId: sesion.user.id, comunidadId: cid }, "Sesión invalidada por cambio de rol/estado")
  }

  return NextResponse.json({ ok: true, cambios: { rol: cambiaRol, activo: cambiaActivo } })
}
