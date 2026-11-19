/** @vitest-environment node */
/**
 * F43 · T3 — el texto del correo de bienvenida (S1, S2, S3, S8).
 *
 * Qué fija este archivo:
 *
 *   1. El asunto y el cuerpo dicen lo que el doc cerró: nombre, comunidad, rol y
 *      enlace, con la redacción exacta de «Texto del correo», y NINGUNA cita
 *      legal (ni «art.», ni «artículo», ni «Ley», ni números de ley): la base
 *      legal vive en la spec y en el manual, no en la bandeja del invitado.
 *   2. Las viñetas de «qué puede hacer» salen de la matriz, no de la prosa (S8):
 *      cada viñeta declara el par (rol, acción, recurso) que `puede()` concede, y
 *      el test falla nombrando el rol y la capacidad si esa concesión se pierde.
 *      El pin explícito de una pareja queda en el nombre del test para que el
 *      fallo se lea solo.
 *   3. Un rol con menos capacidades recibe menos viñetas —nunca una vacía ni un
 *      renglón «- » suelto— y sin viñetas el bloque no deja un encabezado
 *      colgado.
 *   4. El motivo que se persiste no puede llevar el enlace ni el token: el
 *      mecanismo que lo garantiza se prueba acá, porque el servidor SMTP podría
 *      devolver el cuerpo dentro del texto de rechazo.
 */
import { describe, expect, it } from "vitest"
import { ROLES, puede, type Rol } from "@/lib/authz"
import {
  ETIQUETA_ROL,
  PARRAFO_POR_ROL,
  VINETAS_POR_ROL,
  asuntoBienvenida,
  bloqueDeVinetas,
  cuerpoBienvenida,
  sinEnlaceEnElMotivo,
  vinetasConcedidas,
  vinetasDelRol,
  type VinetaDeclarada,
} from "@/lib/correo-bienvenida"

const COMUNIDAD = "Los Aromos"
const NOMBRE = "Ana María Rojas"
const ENLACE =
  "http://localhost/invitacion?token=AbC123defGHI456jklMNO789pqr_-xyzABC"

/** El cuerpo completo de un rol, con los mismos datos que usa el envío. */
function cuerpoDe(rol: Rol): string {
  return cuerpoBienvenida({ nombre: NOMBRE, comunidad: COMUNIDAD, rol, enlace: ENLACE })
}

/** Los datos que el servidor completa entre `<>` en la redacción cerrada. */
const DATOS = { nombre: NOMBRE, comunidad: COMUNIDAD, enlace: ENLACE }

describe("asunto y cuerpo del correo de bienvenida", () => {
  it("el asunto nombra la comunidad y el producto, como quedó cerrado", () => {
    expect(asuntoBienvenida({ comunidad: COMUNIDAD })).toBe(
      `Tu acceso a ${COMUNIDAD} en Compass`
    )
  })

  it("el cuerpo lleva el nombre, la comunidad, el rol y el enlace de cada rol", () => {
    for (const rol of ROLES) {
      const cuerpo = cuerpoDe(rol)
      expect(cuerpo.startsWith(`Hola ${NOMBRE}:`)).toBe(true)
      expect(cuerpo).toContain(
        `La administración de ${COMUNIDAD} te creó una cuenta en Compass`
      )
      expect(cuerpo).toContain(`Tu rol es ${ETIQUETA_ROL[rol]}.`)
      expect(cuerpo).toContain(`Para entrar, define tu contraseña acá:\n\n${ENLACE}`)
      expect(cuerpo).toContain(PARRAFO_POR_ROL[rol])
      expect(cuerpo.trimEnd().endsWith(
        `Si no esperabas este correo, avísale a la administración de ${COMUNIDAD}.`
      )).toBe(true)
    }
  })

  it("el cuerpo dice que el enlace es de un solo uso y vence en 72 horas", () => {
    const cuerpo = cuerpoDe("residente")
    expect(cuerpo).toContain("El enlace sirve una sola vez y vence en 72 horas.")
    expect(cuerpo).toContain("administración que te lo reenvíe.")
  })

  it("ningún rol cita artículos ni números de ley", () => {
    for (const rol of ROLES) {
      const cuerpo = cuerpoDe(rol)
      expect(cuerpo).not.toMatch(/\bart\./i)
      expect(cuerpo).not.toMatch(/\bartículos?\b/i)
      // La palabra suelta en minúscula («la ley reserva») es prosa del texto
      // cerrado; una cita es «Ley» con mayúscula seguida de número.
      expect(cuerpo).not.toMatch(/\bLey\b/)
      expect(cuerpo).not.toMatch(/\b\d{1,2}\.\d{3}\b/)
    }
  })

  it("el texto no grita ni trata de «estimado usuario» a nadie", () => {
    for (const rol of ROLES) {
      const cuerpo = cuerpoDe(rol)
      expect(cuerpo).not.toMatch(/\b[A-ZÁÉÍÓÚÑ]{3,}\b/)
      expect(cuerpo.toLowerCase()).not.toContain("estimado")
    }
  })
})

describe("las viñetas salen de la matriz de permisos (S8)", () => {
  it("ningún rol declara más de tres viñetas", () => {
    for (const rol of ROLES) {
      expect(VINETAS_POR_ROL[rol].length).toBeLessThanOrEqual(3)
    }
  })

  it.each(ROLES)(
    "S8 — el rol %s solo promete capacidades que puede() concede",
    (rol) => {
      const declaradas = VINETAS_POR_ROL[rol]
      expect(declaradas.length).toBeGreaterThan(0)
      for (const vineta of declaradas) {
        expect(
          puede(rol, vineta.accion, vineta.recurso),
          `${rol} perdió ${vineta.accion} sobre ${vineta.recurso}: la viñeta «${vineta.texto}» prometería algo que el motor niega`
        ).toBe(true)
        expect(vineta.texto.trim()).not.toBe("")
      }
    }
  )

  it("S8 — pin de la pareja residente + fi:aviso:propio ver: la viñeta «Ver los avisos de cobro de tus unidades.» deja de concederse y este test falla", () => {
    const declarada = VINETAS_POR_ROL.residente.find(
      (v) => v.accion === "ver" && v.recurso === "fi:aviso:propio"
    )
    expect(declarada).toBeDefined()
    expect(puede("residente", "ver", "fi:aviso:propio")).toBe(true)
    expect(cuerpoDe("residente")).toContain(`- ${declarada!.texto}`)
  })

  it("el cuerpo lleva exactamente las viñetas declaradas, en orden y sin relleno", () => {
    for (const rol of ROLES) {
      const lineas = cuerpoDe(rol)
        .split("\n")
        .filter((linea) => linea.startsWith("- "))
      expect(lineas).toEqual(
        VINETAS_POR_ROL[rol].map((v) => `- ${v.texto}`)
      )
      expect(cuerpoDe(rol)).not.toMatch(/^-\s*$/m)
    }
  })

  it("un rol con menos capacidades recibe menos viñetas, no una vacía", () => {
    const candidatas: readonly VinetaDeclarada[] = [
      { accion: "ver", recurso: "cf", texto: "Configurar la comunidad." },
      {
        accion: "ver",
        recurso: "fi:aviso:propio",
        texto: "Ver los avisos de cobro de tus unidades.",
      },
      {
        accion: "editar",
        recurso: "admin:usuarios",
        texto: "Cambiar el estado de las cuentas.",
      },
    ]
    // El residente no configura la comunidad ni administra cuentas: de tres
    // candidatas queda una sola, y ninguna se rellena.
    const concedidas = vinetasConcedidas("residente", candidatas)
    expect(concedidas).toEqual(["Ver los avisos de cobro de tus unidades."])
    expect(vinetasDelRol("residente")).toHaveLength(3)

    const bloque = bloqueDeVinetas("residente", concedidas)
    expect(bloque.match(/^- /gm)).toHaveLength(1)
    expect(bloque).not.toMatch(/^-\s*$/m)

    // Sin ninguna viñeta no queda un «Esto es lo que puedes hacer» colgado.
    expect(bloqueDeVinetas("residente", [])).toBe("Tu rol es residente.")
  })
})

describe("el motivo persistido no puede llevar el enlace ni el token", () => {
  const TOKEN = "AbC123defGHI456jklMNO789pqr_-xyzABC"

  it("borra el enlace completo y el token suelto del texto del servidor", () => {
    const motivo = `El servidor rechazó el mensaje (554): copia del cuerpo ${ENLACE} con el token ${TOKEN} adentro.`
    const limpio = sinEnlaceEnElMotivo(motivo, ENLACE)
    expect(limpio).not.toBeNull()
    expect(limpio).not.toContain(ENLACE)
    expect(limpio).not.toContain(TOKEN)
    expect(limpio).not.toContain("token=")
    expect(limpio).toContain("El servidor rechazó el mensaje (554)")
  })

  it("deja intacto un motivo que no nombra el enlace", () => {
    const motivo = "Aceptado por el servidor SMTP (id <falso-0001@ejemplo.test>)."
    expect(sinEnlaceEnElMotivo(motivo, ENLACE)).toBe(motivo)
    expect(sinEnlaceEnElMotivo(null, ENLACE)).toBeNull()
  })

  it("un enlace sin token no rompe la limpieza", () => {
    expect(sinEnlaceEnElMotivo("rebotó", "no-es-una-url")).toBe("rebotó")
  })
})
