import speakeasy from "speakeasy"
import QRCode from "qrcode"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"

/**
 * SERIE-PRODUCCION-FASE2 P3 — 2FA/TOTP con Google Authenticator.
 *
 * Lógica pura de segundo factor: secreto TOTP, verificación de códigos y
 * códigos de respaldo. Sin dependencias de Next/Prisma para facilitar tests.
 */

export const TOTP_VENTANA = 1 // pasos de 30s admitidos hacia atrás/adelante
export const BACKUP_CODES_CANTIDAD = 10
export const BACKUP_CODES_COSTO_BCRYPT = 10 // igual costo que HASH_DUMMY/login (P2)

/** Caracteres sin ambigüedad visual (sin 0/O ni 1/I/l). */
const ALFABETO_BACKUP = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export interface Secreto2FA {
  secretoBase32: string
  otpauthUrl: string
  qrDataUrl: string
}

/**
 * Genera un secreto TOTP y su QR (data URL PNG) para enrolar en
 * Google Authenticator. El secreto se guarda en BD como pendiente
 * (twoFactorEnabled sigue false hasta verify-setup).
 */
export async function generarSecreto2FA(email: string): Promise<Secreto2FA> {
  const generado = speakeasy.generateSecret({
    length: 20,
    name: `Compass:${email}`,
    issuer: "Compass",
  })
  const secretoBase32 = generado.base32
  const otpauthUrl = generado.otpauth_url ?? ""
  if (!secretoBase32 || !otpauthUrl) {
    throw new Error("No fue posible generar el secreto TOTP.")
  }
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl)
  return { secretoBase32, otpauthUrl, qrDataUrl }
}

/**
 * Verifica un código TOTP de 6 dígitos contra el secreto.
 * Acepta ventana ±1 paso (90s) para tolerar desvío de reloj.
 */
export function verificarCodigo2FA(secretoBase32: string, codigo: string): boolean {
  const limpio = codigo.trim()
  if (!/^\d{6}$/.test(limpio)) return false
  return Boolean(
    speakeasy.totp.verify({
      secret: secretoBase32,
      encoding: "base32",
      token: limpio,
      window: TOTP_VENTANA,
    })
  )
}

/** Genera N códigos de respaldo aleatorios de 8 caracteres (texto plano, mostrar una sola vez). */
export function generarBackupCodes(cantidad: number = BACKUP_CODES_CANTIDAD): string[] {
  const codigos: string[] = []
  for (let i = 0; i < cantidad; i++) {
    const bytes = randomBytes(8)
    let codigo = ""
    for (const b of bytes) {
      codigo += ALFABETO_BACKUP[b % ALFABETO_BACKUP.length]
    }
    codigos.push(codigo)
  }
  return codigos
}

/** Hashea códigos de respaldo con bcrypt y los serializa como JSON para BD. */
export async function hashearBackupCodes(codigos: string[]): Promise<string> {
  const hashes: string[] = []
  for (const codigo of codigos) {
    hashes.push(await bcrypt.hash(codigo, BACKUP_CODES_COSTO_BCRYPT))
  }
  return JSON.stringify(hashes)
}

/** Parsea el JSON de hashes guardado en BD; ante dato corrupto retorna []. */
export function parsearBackupCodes(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((h): h is string => typeof h === "string")
  } catch {
    return []
  }
}

/**
 * Verifica un código de respaldo y lo consume (un solo uso).
 * Retorna el JSON actualizado sin el hash consumido.
 */
export async function consumirBackupCode(
  hashesJson: string | null | undefined,
  codigo: string
): Promise<{ valido: boolean; restantesJson: string }> {
  const hashes = parsearBackupCodes(hashesJson)
  const limpio = codigo.trim().toUpperCase()
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(limpio, hashes[i]!)) {
      const restantes = [...hashes.slice(0, i), ...hashes.slice(i + 1)]
      return { valido: true, restantesJson: JSON.stringify(restantes) }
    }
  }
  return { valido: false, restantesJson: JSON.stringify(hashes) }
}
