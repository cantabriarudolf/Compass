import { NextResponse, NextRequest } from "next/server"
import { z } from "zod"
import {
  verificarCredenciales,
  CredencialesInvalidas,
  PasswordDebil,
  LimiteIntentos,
} from "@/lib/auth"
import { crearDesafio2FA } from "@/lib/two-factor-token"

export const dynamic = "force-dynamic"

const BodySchema = z.object({
  email: z.string({ required_error: "El correo es obligatorio." }).trim().min(1, "El correo es obligatorio."),
  password: z.string({ required_error: "La contraseña es obligatoria." }).min(1, "La contraseña es obligatoria."),
})

function claveIp(request: NextRequest): string {
  const bruto = request.headers.get("x-forwarded-for") ?? "local"
  return bruto.split(",")[0]!.trim() || "local"
}

/**
 * POST /api/auth/2fa/challenge — SERIE-PRODUCCION-FASE2 P3.
 * Primera fase del login con 2FA: valida credenciales con las mismas defensas
 * que authorize (rate limit D-v, password policy P2, bcrypt, sin enumeración).
 * - Sin 2FA → { requires2FA: false } (el cliente sigue el login Auth.js normal).
 * - Con 2FA → { requires2FA: true, tempToken } (JWE de 5 min para /verify).
 *
 * Desvío documentado vs prompt: authorize de Auth.js NO puede transportar el
 * tempToken al cliente (su vía de error solo lleva códigos), por eso el desafío
 * vive en este endpoint y authorize rechaza login directo con Requiere2FA.
 */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    // Mensaje genérico: no filtrar qué campo falta (anti-enumeración).
    return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 })
  }

  const email = parsed.data.email.toLowerCase()
  const claves = [claveIp(request), `email:${email}`]

  try {
    const usuario = await verificarCredenciales(parsed.data.email, parsed.data.password, claves)
    if (!usuario.twoFactorEnabled) {
      return NextResponse.json({ requires2FA: false })
    }
    const tempToken = await crearDesafio2FA(usuario.id)
    return NextResponse.json({ requires2FA: true, tempToken })
  } catch (error) {
    if (error instanceof LimiteIntentos) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espere unos minutos." },
        { status: 429 }
      )
    }
    if (error instanceof CredencialesInvalidas || error instanceof PasswordDebil) {
      return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 })
    }
    throw error
  }
}
