/**
 * @vitest-environment node
 *
 * F42 · T3 — el primer arranque: `scripts/crear-admin.mjs`.
 *
 * El sistema no tenía forma de crear la primera cuenta sin tocar la base: la
 * pantalla exige sesión y el alta exige administrador, así que la comunidad
 * nacía sin puerta. Este script es esa puerta, y este archivo fija sus dos
 * obligaciones:
 *
 *   1. Con la base configurada crea la comunidad y la PRIMERA cuenta
 *      administradora, atada a una invitación de un solo uso emitida por
 *      `crearInvitacionDeAcceso` (la misma función del alta: S4 no se reimplementa),
 *      e imprime en consola el enlace completo a `/invitacion?token=…`. La cuenta
 *      nace SIN contraseña y sin persona: el primer arranque existe antes que el
 *      padrón, y la persona define su contraseña al abrir el enlace —el "cambio
 *      forzado" de S2 sin columna ni flag—.
 *   2. Es idempotente y se NIEGA a duplicar: si la comunidad ya tiene una cuenta,
 *      se detiene, lo dice y no escribe nada. La segunda cuenta no se crea por
 *      accidente.
 *
 * El enlace se prueba de verdad: el test toma el token que el script imprimió y
 * lo canjea contra `definirPasswordConInvitacion`, que es la única función que
 * escribe `passwordHash`. Si el enlace impreso no abre nada, el caso falla.
 *
 * El script corre en un proceso aparte con `vite-node` (el mismo runner de los
 * otros `.mjs` que importan `lib/**`), contra la base descartable de la suite: el
 * proceso hijo hereda `DATABASE_URL` del arnés y nunca toca `prisma/dev.db`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { prisma } from "@/lib/prisma"

const RAIZ = path.resolve(__dirname, "../..")
/** CLI de vite-node del workspace: el mismo que usa `scripts/email-prueba.mjs`. */
const VITE_NODE = path.resolve(RAIZ, "../../node_modules/vite-node/vite-node.mjs")
const SCRIPT = path.join(RAIZ, "scripts", "crear-admin.mjs")
const PASSWORD = "ClaveSegura123"

const SFX = Date.now().toString(36)
const comunidadNueva = `bootstrap-comunidad-${SFX}`
const comunidadPrevia = `bootstrap-previa-${SFX}`
const emailAdmin = `bootstrap-admin-${SFX}@test.cl`
const emailPrevia = `bootstrap-previa-${SFX}@test.cl`

interface Corrida {
  status: number | null
  stdout: string
  stderr: string
}

function correr(args: string[], extraEnv: Record<string, string> = {}): Corrida {
  const resultado = spawnSync(
    process.execPath,
    [VITE_NODE, "--config", "vitest.config.ts", SCRIPT, ...args],
    {
      cwd: RAIZ,
      // El hijo hereda la base descartable del arnés; no se lee ningún `.env`.
      env: { ...process.env, NODE_ENV: "test", ...extraEnv },
      encoding: "utf8",
      timeout: 120_000,
    }
  )
  return {
    status: resultado.status,
    stdout: resultado.stdout ?? "",
    stderr: resultado.stderr ?? "",
  }
}

function argumentos(opciones: {
  comunidadId: string
  comunidadNombre: string
  adminEmail: string
}): string[] {
  return [
    `--comunidad-id=${opciones.comunidadId}`,
    `--comunidad-nombre=${opciones.comunidadNombre}`,
    `--admin-email=${opciones.adminEmail}`,
    "--base-url=https://app.test",
  ]
}

/** Token base64url de 32 bytes (43 caracteres), tal como lo imprime el script. */
const ENLACE = /https:\/\/app\.test\/invitacion\?token=([A-Za-z0-9_-]{43})/

describe("F42 T3 — crear-admin: el primer arranque con invitación", () => {
  beforeAll(async () => {
    await prisma.comunidad.deleteMany({
      where: { id: { in: [comunidadNueva, comunidadPrevia] } },
    })
    await prisma.usuario.deleteMany({
      where: { email: { in: [emailAdmin, emailPrevia] } },
    })
  }, 60_000)

  afterAll(async () => {
    try {
      await prisma.usuario.deleteMany({
        where: { email: { in: [emailAdmin, emailPrevia] } },
      })
      await prisma.comunidad.deleteMany({
        where: { id: { in: [comunidadNueva, comunidadPrevia] } },
      })
    } catch {
      // intencional: limpieza best-effort
    }
  })

  it("crea la comunidad, la primera cuenta administradora y la invitación, e imprime el enlace", async () => {
    const corrida = correr(
      argumentos({
        comunidadId: comunidadNueva,
        comunidadNombre: "Comunidad Primer Arranque",
        adminEmail: emailAdmin,
      })
    )
    // El script avisa por stderr qué `DATABASE_URL` descartó: es contrato de las CLI de
    // datos informar el motivo (nunca el valor), y ese aviso aparece siempre que el
    // `.env` apunte a un motor distinto del cliente generado. Cualquier otra línea de
    // stderr sigue siendo un fallo.
    const ruido = corrida.stderr
      .split("\n")
      .filter((linea) => linea.trim() !== "" && !linea.startsWith("[db-url] descartado:"))
    expect(ruido).toEqual([])
    expect(corrida.status).toBe(0)

    // El enlace completo, con su token, es la salida útil del script.
    const enlace = ENLACE.exec(corrida.stdout)
    expect(enlace).not.toBeNull()
    const token = enlace![1]!
    expect(corrida.stdout).toContain(comunidadNueva)
    expect(corrida.stdout).toContain(emailAdmin)
    // El hueco declarado: el correo de bienvenida no existe todavía.
    expect(corrida.stdout).toContain("El envío por correo todavía no existe")

    const comunidad = await prisma.comunidad.findUnique({
      where: { id: comunidadNueva },
    })
    expect(comunidad?.nombre).toBe("Comunidad Primer Arranque")

    const usuario = await prisma.usuario.findUnique({
      where: { email: emailAdmin },
    })
    expect(usuario).not.toBeNull()
    // S2 sin columna nueva: la cuenta nace sin contraseña y sin persona.
    expect(usuario!.passwordHash).toBeNull()
    expect(usuario!.personaId).toBeNull()
    expect(usuario!.activo).toBe(true)

    const membresia = await prisma.membresia.findFirst({
      where: { usuarioId: usuario!.id, comunidadId: comunidadNueva },
    })
    expect(membresia?.rol).toBe("administrador")

    const invitaciones = await prisma.invitacionAcceso.findMany({
      where: { usuarioId: usuario!.id, comunidadId: comunidadNueva },
    })
    expect(invitaciones).toHaveLength(1)
    expect(invitaciones[0]!.usadoEn).toBeNull()
    expect(invitaciones[0]!.expiraEn.getTime()).toBeGreaterThan(Date.now())
    // La emisión la firma la propia cuenta: en el primer arranque no hay otro actor.
    expect(invitaciones[0]!.creadoPor).toBe(usuario!.id)

    // S5: el primer arranque también deja su rastro.
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { comunidadId: comunidadNueva, tipoAccion: "cuenta_inicial_creada" },
    })
    expect(evento).not.toBeNull()
    expect(evento!.referenciaId).toBe(usuario!.id)

    // El enlace impreso es real: el token define la contraseña por el mismo
    // camino que cualquier invitado.
    const { definirPasswordConInvitacion } = await import("@/lib/invitacion-acceso")
    const canje = await definirPasswordConInvitacion({ token, password: PASSWORD })
    expect(canje.ok).toBe(true)
    const despues = await prisma.usuario.findUnique({ where: { id: usuario!.id } })
    expect(despues!.passwordHash).not.toBeNull()
  }, 180_000)

  it("se niega a duplicar: si la comunidad ya tiene una cuenta, se detiene y lo dice", async () => {
    const antes = {
      usuarios: await prisma.usuario.count({ where: { email: emailAdmin } }),
      membresias: await prisma.membresia.count({
        where: { comunidadId: comunidadNueva },
      }),
      invitaciones: await prisma.invitacionAcceso.count({
        where: { comunidadId: comunidadNueva },
      }),
    }

    const corrida = correr(
      argumentos({
        comunidadId: comunidadNueva,
        comunidadNombre: "Comunidad Primer Arranque",
        adminEmail: `bootstrap-segunda-${SFX}@test.cl`,
      })
    )

    expect(corrida.status).toBe(1)
    expect(corrida.stderr).toContain(
      "La comunidad ya tiene una cuenta: no se crea otra."
    )
    // Nada escrito: ni cuenta nueva, ni membresía, ni invitación.
    expect(await prisma.usuario.count({ where: { email: emailAdmin } })).toBe(
      antes.usuarios
    )
    expect(
      await prisma.membresia.count({ where: { comunidadId: comunidadNueva } })
    ).toBe(antes.membresias)
    expect(
      await prisma.invitacionAcceso.count({ where: { comunidadId: comunidadNueva } })
    ).toBe(antes.invitaciones)
    expect(
      await prisma.usuario.findUnique({
        where: { email: `bootstrap-segunda-${SFX}@test.cl` },
      })
    ).toBeNull()
  }, 180_000)

  it("con la comunidad ya creada y sin cuentas, crea la primera y no la duplica", async () => {
    // Estado intermedio real: alguien creó la comunidad (p. ej. en un intento
    // anterior) pero no hay ninguna cuenta. El script la usa, no la recrea.
    await prisma.comunidad.create({
      data: {
        id: comunidadPrevia,
        nombre: "Comunidad Previa",
        slug: `bootstrap-previa-${SFX}`,
      },
    })

    const corrida = correr(
      argumentos({
        comunidadId: comunidadPrevia,
        comunidadNombre: "Comunidad Previa",
        adminEmail: emailPrevia,
      })
    )
    expect(corrida.status).toBe(0)
    expect(ENLACE.test(corrida.stdout)).toBe(true)

    const comunidades = await prisma.comunidad.findMany({
      where: { id: comunidadPrevia },
    })
    expect(comunidades).toHaveLength(1)
    expect(comunidades[0]!.nombre).toBe("Comunidad Previa")
    const usuario = await prisma.usuario.findUnique({
      where: { email: emailPrevia },
    })
    expect(usuario).not.toBeNull()
    expect(
      await prisma.membresia.count({
        where: { usuarioId: usuario!.id, comunidadId: comunidadPrevia },
      })
    ).toBe(1)
  }, 180_000)

  it("sin argumentos obligatorios explica el uso y no toca la base", async () => {
    const corrida = correr([`--comunidad-id=${comunidadNueva}`])
    expect(corrida.status).toBe(2)
    expect(corrida.stderr).toContain("--admin-email")
    expect(corrida.stderr).toContain("--comunidad-nombre")
  }, 120_000)
})
