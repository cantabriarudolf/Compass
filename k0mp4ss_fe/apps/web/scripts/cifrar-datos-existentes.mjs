// SERIE-PRODUCCION-FASE2 P4: migra filas con campos sensibles en texto plano a
// cifrado AES-256-GCM. Idempotente (salta valores con prefijo v1.gcm.).
// Correr UNA vez en producción tras desplegar P4, con CLAVE_CIFRADO_DATOS real.
//
// Uso:
//   npm run cifrar:datos            (aplica)
//   npm run cifrar:datos -- --dry-run   (solo reporta, no escribe)
//
// Espejo autocontenido de lib/crypto.ts (.mjs no puede importar TS).
// Campos cubiertos: espejo de CAMPOS_CIFRADOS en lib/prisma-cifrado.ts.
/* global process, Buffer */
import { PrismaClient } from "@prisma/client"
import { createCipheriv, createHash, randomBytes } from "node:crypto"

const PREFIJO = "v1.gcm."
const DRY_RUN = process.argv.includes("--dry-run")

const CAMPOS = {
  usuarios: ["twoFactorSecret", "twoFactorBackupCodes"],
  personas: ["rut", "email", "telefonoMovil", "telefonoFijo", "datosLaborales"],
  proveedores_pe: ["rut", "telefono", "email"],
  configuracion_global: [
    "rutComunidad",
    "rutAdministrador",
    "direccionOficial",
    "telefonoAdmin",
    "smtpUser",
    "smtpPassword",
  ],
}
// Columnas Json (objeto → se serializa antes de cifrar)
const CAMPOS_JSON = new Set(["datosLaborales"])

function derivarClave() {
  const clave = process.env.CLAVE_CIFRADO_DATOS
  if (!clave) throw new Error("CLAVE_CIFRADO_DATOS no configurada. Abortando (nunca dummy en migración).")
  if (clave.length < 32) throw new Error("CLAVE_CIFRADO_DATOS debe tener al menos 32 caracteres.")
  const buf = Buffer.from(clave, "utf8")
  return buf.length === 32 ? buf : createHash("sha256").update(buf).digest()
}

function cifrar(textoPlano, clave) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", clave, iv)
  const ct = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  const b64 = (b) => b.toString("base64url")
  return `${PREFIJO}${b64(iv)}.${b64(tag)}.${b64(ct)}`
}

function necesitaCifrado(valor) {
  if (valor === null || valor === undefined) return false
  if (typeof valor === "string") return valor.length > 0 && !valor.startsWith(PREFIJO)
  if (typeof valor === "object") return true // Json legacy en texto plano
  return false
}

function aTextoPlano(campo, valor) {
  if (CAMPOS_JSON.has(campo) && typeof valor === "object") return JSON.stringify(valor)
  return valor
}

async function main() {
  const clave = derivarClave()
  const prisma = new PrismaClient()
  const resumen = {}
  try {
    for (const [tabla, campos] of Object.entries(CAMPOS)) {
      let filas = 0
      let camposCifrados = 0
      const colId = '"id"'
      const cols = ['"id"', ...campos.map((c) => `"${c}"`)].join(", ")
      // Tabla puede no existir en esquemas viejos (p.ej. sin 2FA) → salta con aviso
      let registros
      try {
        registros = await prisma.$queryRawUnsafe(`SELECT ${cols} FROM "${tabla}"`)
      } catch (e) {
        console.warn(`[cifrar] tabla "${tabla}" no accesible, se salta: ${e.message?.split("\n")[0]}`)
        continue
      }
      for (const reg of registros) {
        const cambios = {}
        for (const campo of campos) {
          if (necesitaCifrado(reg[campo])) {
            cambios[campo] = cifrar(aTextoPlano(campo, reg[campo]), clave)
            camposCifrados += 1
          }
        }
        if (Object.keys(cambios).length > 0) {
          filas += 1
          if (!DRY_RUN) {
            const sets = Object.keys(cambios).map((c) => `"${c}" = ?`).join(", ")
            await prisma.$executeRawUnsafe(
              `UPDATE "${tabla}" SET ${sets} WHERE ${colId} = ?`,
              ...Object.values(cambios),
              reg.id
            )
          }
        }
      }
      resumen[tabla] = { filas, camposCifrados }
    }
  } finally {
    await prisma.$disconnect()
  }
  console.log(DRY_RUN ? "[cifrar] DRY-RUN (sin escrituras):" : "[cifrar] Aplicado:")
  for (const [tabla, r] of Object.entries(resumen)) {
    console.log(`  ${tabla}: ${r.filas} filas, ${r.camposCifrados} campos`)
  }
}

main().catch((e) => {
  console.error("[cifrar] ERROR:", e.message)
  process.exit(1)
})
