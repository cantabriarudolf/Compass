import { NextResponse, NextRequest } from "next/server"
import { NOMBRE_COOKIE_SESION, verificarToken } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const token = request.cookies.get(NOMBRE_COOKIE_SESION)?.value
  const sesion = verificarToken(token)
  return NextResponse.json({ autenticado: Boolean(sesion) })
}
