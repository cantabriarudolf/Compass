/** @vitest-environment node */
/**
 * Cifrado de secretos por comunidad (F33) — AES-256-GCM con clave maestra del
 * entorno.
 *
 * Lo que este archivo fija, que es lo que no se negocia cuando un secreto real
 * (la contraseña del buzón de una comunidad) viaja a la base:
 *
 *   1. ida y vuelta: `descifrarSecreto(cifrarSecreto(x)) === x`;
 *   2. IV por llamada: dos cifrados del mismo texto dan paquetes distintos, y
 *      los dos descifran al mismo texto (nadie compara cifrados para saber si
 *      dos comunidades comparten contraseña);
 *   3. un paquete alterado en un byte NO descifra: GCM autentica, así que el
 *      error sale en vez de devolver basura a medias (alterar el ciphertext, el
 *      IV o el tag es el mismo caso);
 *   4. clave maestra ausente → error EXPLÍCITO y ningún paquete: no hay
 *      `cifrarSecreto` que devuelva algo, y el mensaje nombra la variable;
 *   5. clave de longitud inválida → error explícito y ningún paquete;
 *   6. ningún mensaje de error contiene el secreto: ni el literal, ni su
 *      base64, ni un fragmento.
 *
 * La clave es de prueba: `"a".repeat(64)` es hex de 32 bytes, no una credencial.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  ClaveMaestraAusenteError,
  ClaveMaestraInvalidaError,
  SecretoIlegibleError,
  VARIABLE_CLAVE_MAESTRA,
  cifrarSecreto,
  descifrarSecreto,
  estadoClaveMaestra,
  type EntornoCifrado,
} from "@/lib/cifrado-secretos"

/** 32 bytes en hex: la forma canónica de la clave maestra. */
const CLAVE_HEX = "a".repeat(64)
/** Los mismos 32 bytes en base64 (44 caracteres con relleno). */
const CLAVE_BASE64 = Buffer.from(CLAVE_HEX, "hex").toString("base64")
/** Contraseña inventada: no es una credencial, es texto de prueba. */
const SECRETO = "clave-smtp-inventada-solo-para-tests"

const entornoPrevio = process.env[VARIABLE_CLAVE_MAESTRA]

function fijarClave(valor: string | undefined): void {
  if (valor === undefined) delete process.env[VARIABLE_CLAVE_MAESTRA]
  else process.env[VARIABLE_CLAVE_MAESTRA] = valor
}

/** Entorno explícito (sin tocar `process.env`) para los casos de clave. */
function entorno(valor: string | undefined): EntornoCifrado {
  return valor === undefined ? {} : { [VARIABLE_CLAVE_MAESTRA]: valor }
}

/** Paquete válido, cifrado con la clave de prueba. */
function paqueteDe(secreto: string = SECRETO) {
  return cifrarSecreto(secreto, entorno(CLAVE_HEX))
}

/** Invierte un byte del contenido base64url (sin cambiar la longitud). */
function alterarByte(contenido: string): string {
  const bytes = Buffer.from(contenido, "base64url")
  const primero = bytes[0] ?? 0
  bytes[0] = primero ^ 0xff
  return bytes.toString("base64url")
}

/** Mensaje del error capturado, o cadena vacía si no lanzó. */
function mensajeDe(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return ""
}

beforeEach(() => {
  fijarClave(CLAVE_HEX)
})

afterEach(() => {
  fijarClave(entornoPrevio)
})

describe("ida y vuelta (AES-256-GCM)", () => {
  it("descifrar(cifrar(x)) devuelve el mismo texto, incluido unicode y largos", () => {
    for (const texto of [SECRETO, "contraseña-con-ñ-y-♥", "", "x".repeat(4000)]) {
      expect(descifrarSecreto(paqueteDe(texto), entorno(CLAVE_HEX))).toBe(texto)
    }
  })

  it("acepta la clave maestra en hex o en base64 (mismos 32 bytes)", () => {
    const paquete = cifrarSecreto(SECRETO, entorno(CLAVE_HEX))
    expect(descifrarSecreto(paquete, entorno(CLAVE_BASE64))).toBe(SECRETO)
    const desdeBase64 = cifrarSecreto(SECRETO, entorno(CLAVE_BASE64))
    expect(descifrarSecreto(desdeBase64, entorno(CLAVE_HEX))).toBe(SECRETO)
  })

  it("el paquete no contiene el secreto en claro ni su base64", () => {
    const paquete = paqueteDe()
    const junto = `${paquete.secretoCifrado}|${paquete.iv}|${paquete.authTag}`
    expect(junto).not.toContain(SECRETO)
    expect(junto).not.toContain(Buffer.from(SECRETO, "utf8").toString("base64"))
    expect(paquete.iv.length).toBeGreaterThan(0)
    expect(paquete.authTag.length).toBeGreaterThan(0)
  })
})

describe("IV único por llamada", () => {
  it("dos cifrados del mismo texto dan paquetes distintos y descifran igual", () => {
    const primero = paqueteDe()
    const segundo = paqueteDe()
    expect(segundo.iv).not.toBe(primero.iv)
    expect(segundo.secretoCifrado).not.toBe(primero.secretoCifrado)
    expect(descifrarSecreto(primero, entorno(CLAVE_HEX))).toBe(SECRETO)
    expect(descifrarSecreto(segundo, entorno(CLAVE_HEX))).toBe(SECRETO)
  })
})

describe("un paquete alterado no descifra (GCM autentica)", () => {
  it("alterar el ciphertext lanza y no devuelve basura", () => {
    const paquete = paqueteDe()
    const alterado = { ...paquete, secretoCifrado: alterarByte(paquete.secretoCifrado) }
    expect(() => descifrarSecreto(alterado, entorno(CLAVE_HEX))).toThrow(SecretoIlegibleError)
    expect(mensajeDe(() => descifrarSecreto(alterado, entorno(CLAVE_HEX)))).not.toContain(SECRETO)
  })

  it("alterar el tag de autenticación lanza", () => {
    const paquete = paqueteDe()
    const alterado = { ...paquete, authTag: alterarByte(paquete.authTag) }
    expect(() => descifrarSecreto(alterado, entorno(CLAVE_HEX))).toThrow(SecretoIlegibleError)
  })

  it("alterar el IV lanza", () => {
    const paquete = paqueteDe()
    const alterado = { ...paquete, iv: alterarByte(paquete.iv) }
    expect(() => descifrarSecreto(alterado, entorno(CLAVE_HEX))).toThrow(SecretoIlegibleError)
  })

  it("con otra clave maestra el paquete no se puede abrir (falla cerrado)", () => {
    const paquete = paqueteDe()
    expect(() => descifrarSecreto(paquete, entorno("b".repeat(64)))).toThrow(SecretoIlegibleError)
  })

  it("un paquete incompleto se rechaza antes de intentar descifrar", () => {
    const paquete = paqueteDe()
    expect(() => descifrarSecreto({ ...paquete, iv: "" }, entorno(CLAVE_HEX))).toThrow(
      SecretoIlegibleError
    )
    expect(() =>
      descifrarSecreto({ ...paquete, authTag: "no-es-un-tag" }, entorno(CLAVE_HEX))
    ).toThrow(SecretoIlegibleError)
  })
})

describe("fail-closed sin clave maestra", () => {
  it("sin la variable NO se cifra: error explícito y ningún paquete", () => {
    for (const ausente of [undefined, "", "   "]) {
      expect(() => cifrarSecreto(SECRETO, entorno(ausente))).toThrow(ClaveMaestraAusenteError)
      expect(mensajeDe(() => cifrarSecreto(SECRETO, entorno(ausente)))).toContain(
        VARIABLE_CLAVE_MAESTRA
      )
      expect(estadoClaveMaestra(entorno(ausente))).toBe("ausente")
    }
  })

  it("sin la variable tampoco se descifra: no hay camino a texto plano", () => {
    const paquete = paqueteDe()
    expect(() => descifrarSecreto(paquete, entorno(undefined))).toThrow(ClaveMaestraAusenteError)
  })

  it("clave de longitud inválida: error explícito y ningún paquete", () => {
    for (const invalida of ["corta", "a".repeat(63), "z".repeat(64), "a".repeat(128)]) {
      expect(() => cifrarSecreto(SECRETO, entorno(invalida))).toThrow(ClaveMaestraInvalidaError)
      expect(estadoClaveMaestra(entorno(invalida))).toBe("invalida")
    }
    const mensaje = mensajeDe(() => cifrarSecreto(SECRETO, entorno("corta")))
    expect(mensaje).toContain(VARIABLE_CLAVE_MAESTRA)
    expect(mensaje).toContain("32 bytes")
  })

  it("una clave de 32 caracteres crudos NO se acepta como si fueran 32 bytes", () => {
    // 32 caracteres base64 decodifican 24 bytes: aceptarla derivaría una clave
    // más corta de lo que el operador cree. Se rechaza con el mismo error.
    const cruda = "clave-cruda-de-32-caracteres-123"
    expect(cruda).toHaveLength(32)
    expect(() => cifrarSecreto(SECRETO, entorno(cruda))).toThrow(ClaveMaestraInvalidaError)
  })
})

describe("los mensajes de error nunca llevan el secreto", () => {
  it("ninguna ruta de fallo imprime el secreto ni su base64", () => {
    const base64 = Buffer.from(SECRETO, "utf8").toString("base64")
    const caminos = [
      () => cifrarSecreto(SECRETO, entorno(undefined)),
      () => cifrarSecreto(SECRETO, entorno("corta")),
      () => descifrarSecreto({ ...paqueteDe(), authTag: alterarByte(paqueteDe().authTag) }, entorno(CLAVE_HEX)),
      () => descifrarSecreto(paqueteDe(), entorno("b".repeat(64))),
    ]
    for (const camino of caminos) {
      const mensaje = mensajeDe(camino)
      expect(mensaje.length).toBeGreaterThan(0)
      expect(mensaje).not.toContain(SECRETO)
      expect(mensaje).not.toContain(base64)
    }
  })
})
