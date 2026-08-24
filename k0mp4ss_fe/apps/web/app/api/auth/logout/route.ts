import { NextResponse } from "next/server"
import { NOMBRE_COOKIE_SESION } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST() {
  const respuesta = NextResponse.json({ ok: true })
  respuesta.cookies.set({ name: NOMBRE_COOKIE_SESION, value: "", path: "/", maxAge: 0 })
  return respuesta
}
