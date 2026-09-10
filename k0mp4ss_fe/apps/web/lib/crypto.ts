import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/**
 * SERIE-PRODUCCION-FASE2 P4 — cifrado de datos sensibles en reposo (AES-256-GCM).
 *
 * - AES-256-GCM con IV aleatorio de 12 bytes por valor (recomendación NIST;
 *   16 bytes también válidos, 12 es el estándar para GCM).
 * - Sobre (envelope): `v1.gcm.<iv>.<tag>.<ct>` en base64url. El prefijo permite
 *   detectar valores ya cifrados (migración idempotente) y el passthrough de
 *   texto plano legacy en lectura.
 * - GCM autentica: clave incorrecta o dato manipulado → error (fail-closed,
 *   nunca se retorna basura descifrada).
 *
 * Clave maestra: `CLAVE_CIFRADO_DATOS` (mínimo 32 caracteres). Si mide exactamente
 * 32 bytes se usa directa; si no, se deriva con SHA-256. Sin variable definida:
 * en producción se LANZA (nunca dummy en prod); en dev/test se usa una dummy
 * fija (ver `usandoClaveDummy`).
 */

export const PREFIJO_CIFRADO = "v1.gcm."
const LONGITUD_MINIMA_CLAVE = 32
const DUMMY_DEV = "compass-dev-clave-cifrado-solo-desarrollo"

function sha256(datos: string | Buffer): Buffer {
  return createHash("sha256").update(datos).digest()
}

function derivarClave(): Buffer {
  const clave = process.env.CLAVE_CIFRADO_DATOS
  if (!clave) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CLAVE_CIFRADO_DATOS no configurada en producción.")
    }
    return sha256(DUMMY_DEV)
  }
  if (clave.length < LONGITUD_MINIMA_CLAVE) {
    throw new Error("CLAVE_CIFRADO_DATOS debe tener al menos 32 caracteres.")
  }
  const buf = Buffer.from(clave, "utf8")
  return buf.length === 32 ? buf : sha256(buf)
}

/** true si no hay clave real configurada (dev/test). Útil para asserts de seguridad. */
export function usandoClaveDummy(): boolean {
  return !process.env.CLAVE_CIFRADO_DATOS
}

/** true si el valor ya está cifrado con este sobre (migración idempotente). */
export function estaCifrado(valor: unknown): valor is string {
  return typeof valor === "string" && valor.startsWith(PREFIJO_CIFRADO)
}

/** Cifra texto plano → sobre `v1.gcm.iv.tag.ct` (IV único por llamada). */
export function cifrar(textoPlano: string): string {
  const clave = derivarClave()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", clave, iv)
  const ct = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  const b64 = (b: Buffer): string => b.toString("base64url")
  return `${PREFIJO_CIFRADO}${b64(iv)}.${b64(tag)}.${b64(ct)}`
}

/**
 * Descifra un sobre `v1.gcm.iv.tag.ct`.
 * Lanza si el formato es inválido, la clave es incorrecta o el dato fue
 * manipulado (GCM verifica el tag de autenticación).
 */
export function descifrar(sobre: string): string {
  if (!estaCifrado(sobre)) {
    throw new Error("El valor no es un sobre cifrado válido.")
  }
  const partes = sobre.slice(PREFIJO_CIFRADO.length).split(".")
  if (partes.length !== 3) {
    throw new Error("El valor no es un sobre cifrado válido.")
  }
  const [ivB64, tagB64, ctB64] = partes as [string, string, string]
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      derivarClave(),
      Buffer.from(ivB64, "base64url")
    )
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    throw new Error("No fue posible descifrar (clave incorrecta o dato corrupto).")
  }
}
