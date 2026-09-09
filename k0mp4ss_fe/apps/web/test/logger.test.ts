/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest"
import { Writable } from "node:stream"
import { crearLogger, NIVEL_SILENCIO } from "@/lib/logger"

function capturar() {
  const lineas: string[] = []
  const destino = new Writable({
    write(chunk: unknown, _enc: unknown, cb: (e?: Error | null) => void) {
      lineas.push(String(chunk))
      cb()
    },
  })
  return { destino, lineas }
}

describe("lib/logger — logging estructurado (pino)", () => {
  it("emite JSON con campos base: timestamp, level, msg y service: compass", () => {
    const { destino, lineas } = capturar()
    const log = crearLogger({ nivel: "info", pretty: false, destino })
    log.info("mensaje de prueba")
    expect(lineas).toHaveLength(1)
    const obj = JSON.parse(lineas[0] as string) as Record<string, unknown>
    expect(obj.service).toBe("compass")
    expect(obj.level).toBe(30) // pino: info = 30
    expect(obj.msg).toBe("mensaje de prueba")
    expect(typeof obj.time).toBe("number")
  })

  it("soporta todos los niveles trace..fatal", () => {
    const { destino, lineas } = capturar()
    const log = crearLogger({ nivel: "trace", pretty: false, destino })
    expect(typeof log.trace).toBe("function")
    expect(typeof log.debug).toBe("function")
    expect(typeof log.info).toBe("function")
    expect(typeof log.warn).toBe("function")
    expect(typeof log.error).toBe("function")
    expect(typeof log.fatal).toBe("function")
    log.trace("t")
    log.debug("d")
    log.info("i")
    log.warn("w")
    log.error("e")
    log.fatal("f")
    expect(lineas).toHaveLength(6)
    const niveles = lineas.map((l) => (JSON.parse(l) as { level: number }).level)
    expect(niveles).toEqual([10, 20, 30, 40, 50, 60])
  })

  it("redacta PII: campos email no se emiten en claro", () => {
    const { destino, lineas } = capturar()
    const log = crearLogger({ nivel: "info", pretty: false, destino })
    log.warn({ email: "persona.privada@test.cl", usuarioId: "u-1" }, "authz denegado")
    const obj = JSON.parse(lineas[0] as string) as { email: string; usuarioId: string }
    expect(obj.email).not.toBe("persona.privada@test.cl")
    expect(obj.usuarioId).toBe("u-1")
  })

  it("respeta el nivel configurado: nivel warn filtra info", () => {
    const { destino, lineas } = capturar()
    const log = crearLogger({ nivel: "warn", pretty: false, destino })
    log.info("no debe salir")
    log.warn("sí debe salir")
    expect(lineas).toHaveLength(1)
    expect((JSON.parse(lineas[0] as string) as { msg: string }).msg).toBe("sí debe salir")
  })

  it("nivel por defecto: debug en desarrollo, info en producción", () => {
    const dev = crearLogger({ pretty: false, entorno: "development" })
    const prod = crearLogger({ pretty: false, entorno: "production" })
    expect(dev.level).toBe("debug")
    expect(prod.level).toBe("info")
  })

  it("expone NIVEL_SILENCIO compatible con pino", () => {
    expect(NIVEL_SILENCIO).toBe("silent")
  })
})
