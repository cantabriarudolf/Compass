/** @vitest-environment node */
/**
 * La ÚNICA resolución de correos por persona (`lib/personas-contacto.ts`).
 *
 * Hoy seis sitios repiten `persona.findMany({ select: { id, email } })`; T3 los
 * adopta. Este archivo fija el contrato que esos sitios necesitan:
 *
 *   - una sola consulta para TODOS los ids (sin N+1),
 *   - el correo recortado (el maestro puede guardar espacios),
 *   - la persona sin dirección entra con cadena vacía —nunca `undefined` ni una
 *     dirección inventada—,
 *   - el mapa es TOTAL: pedir un id que no existe (o que es de otra comunidad)
 *     devuelve `""`, porque el tenant no se cruza.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { correosDePersonas } from "@/lib/personas-contacto"

const COM = "entrega-contacto-comunidad"
const OTRA = "entrega-contacto-otra"
const CON_CORREO = "entrega-contacto-con"
const SIN_CORREO = "entrega-contacto-sin"
const DE_OTRA = "entrega-contacto-otra-persona"
const CORREO = "propietario@residencialpruebacontacto.cl"

async function crearPersona(
  comunidadId: string,
  id: string,
  email: string,
  rut: string
): Promise<void> {
  await prisma.persona.create({
    data: {
      id,
      comunidadId,
      rut,
      nombreCompleto: `Persona ${id}`,
      nombres: "Persona",
      apellidos: id,
      email,
      telefonoMovil: "+56900000000",
      estadoCuenta: "activa",
      condicionesEspecialesIds: [],
      roles: ["propietario"],
    },
  })
}

beforeAll(async () => {
  await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM, OTRA] } } })
  await prisma.comunidad.deleteMany({ where: { id: { in: [COM, OTRA] } } })
  await prisma.comunidad.create({
    data: { id: COM, nombre: "Comunidad de contacto", slug: "entrega-contacto" },
  })
  await prisma.comunidad.create({
    data: { id: OTRA, nombre: "Comunidad vecina", slug: "entrega-contacto-otra" },
  })

  await crearPersona(COM, CON_CORREO, `  ${CORREO}  `, "21000001-0")
  await crearPersona(COM, SIN_CORREO, "", "21000002-0")
  await crearPersona(OTRA, DE_OTRA, "ajeno@residencialpruebaotra.cl", "21000003-0")
}, 30_000)

afterAll(async () => {
  await prisma.persona.deleteMany({ where: { comunidadId: { in: [COM, OTRA] } } })
  await prisma.comunidad.deleteMany({ where: { id: { in: [COM, OTRA] } } })
})

describe("correosDePersonas", () => {
  it("devuelve el mapa completo en una sola resolución, con el correo recortado", async () => {
    const correos = await correosDePersonas(COM, [
      CON_CORREO,
      SIN_CORREO,
      "entrega-contacto-inexistente",
      CON_CORREO,
    ])

    expect(correos.size).toBe(3)
    expect(correos.get(CON_CORREO)).toBe(CORREO)
    expect(correos.get(SIN_CORREO)).toBe("")
    expect(correos.get("entrega-contacto-inexistente")).toBe("")
  })

  it("no cruza el tenant: la persona de otra comunidad se resuelve vacía", async () => {
    const correos = await correosDePersonas(COM, [DE_OTRA])
    expect(correos).toEqual(new Map([[DE_OTRA, ""]]))
  })

  it("sin ids no consulta y devuelve un mapa vacío", async () => {
    expect(await correosDePersonas(COM, [])).toEqual(new Map())
  })
})
