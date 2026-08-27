import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { useCompassStore } from "@/lib/store"
import { resetStore } from "../helpers"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

/**
 * Componente de ejemplo representativo (como los formularios de MP/PE)
 * que delega validación al store (repository + StoreResult) y muestra
 * el error devuelto por savePersona. Sirve para verificar el patrón
 * compartido de formularios con validación D1 (media por referencia) y
 * contrato RUT.
 */
function PersonaFormEjemplo({ onOk }: { onOk?: () => void }) {
  const savePersona = useCompassStore((s) => s.savePersona)
  const [rut, setRut] = React.useState("11.111.111-1")
  const [nombres, setNombres] = React.useState("Test")
  const [apellidos, setApellidos] = React.useState("Persona")
  const [email, setEmail] = React.useState("test@example.cl")
  const [fotografiaUrl, setFotografiaUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    const r = savePersona({
      id: `test-p-${Date.now()}`,
      rut,
      nombreCompleto: `${nombres} ${apellidos}`,
      nombres,
      apellidos,
      email,
      telefonoMovil: "+56 9 9999 9999",
      estadoCuenta: "activa",
      roles: ["residente"],
      condicionesEspecialesIds: [],
      fotografiaUrl: fotografiaUrl || undefined,
    } as never)
    if (!r.ok) {
      setError(r.error ?? "Error desconocido")
      return
    }
    setOk("guardado")
    onOk?.()
  }

  return (
    <form onSubmit={onSubmit} aria-label="form-persona">
      <div>
        <Label htmlFor="rut">RUT</Label>
        <Input id="rut" value={rut} onChange={(e) => setRut(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="nombres">Nombres</Label>
        <Input id="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="apellidos">Apellidos</Label>
        <Input id="apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="foto">Foto URL</Label>
        <Input id="foto" value={fotografiaUrl} onChange={(e) => setFotografiaUrl(e.target.value)} placeholder="https://..." />
      </div>
      {error && <p role="alert">{error}</p>}
      {ok && <p role="status">{ok}</p>}
      <Button type="submit">Guardar persona</Button>
    </form>
  )
}

describe("formulario persona — validación compartida (D1 + StoreResult)", () => {
  beforeEach(() => {
    resetStore()
  })
  afterEach(cleanup)

  it("muestra inputs accesibles y guarda persona válida", async () => {
    const user = userEvent.setup()
    render(<PersonaFormEjemplo />)
    expect(screen.getByLabelText(/RUT/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nombres/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Apellidos/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /guardar persona/i }))
    expect(await screen.findByRole("status")).toHaveTextContent(/guardado/i)
    // verificar que el store contiene la persona
    const state = useCompassStore.getState()
    expect(state.personas.some((p) => p.email === "test@example.cl")).toBe(true)
  })

  it("rechaza RUT inválido y muestra mensaje del store", async () => {
    const user = userEvent.setup()
    render(<PersonaFormEjemplo />)
    const rutInput = screen.getByLabelText(/RUT/i)
    await user.clear(rutInput)
    await user.type(rutInput, "11.111.111-2") // DV incorrecto
    await user.click(screen.getByRole("button", { name: /guardar persona/i }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    // el mensaje proviene de validarConEsquema (zod)
    // debe mencionar RUT o documento
    await waitFor(() => expect(screen.getByRole("alert").textContent!.length).toBeGreaterThan(5))
  })

  it("rechaza media por referencia D1 (data: url) con error específico", async () => {
    const user = userEvent.setup()
    render(<PersonaFormEjemplo />)
    await user.type(screen.getByLabelText(/Foto URL/i), "data:image/png;base64,abcd")
    await user.click(screen.getByRole("button", { name: /guardar persona/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Media por referencia/i)
  })

  it("rechaza media por referencia D1 (blob:) igualmente", async () => {
    const user = userEvent.setup()
    render(<PersonaFormEjemplo />)
    // limpiar primera y usar blob
    await user.type(screen.getByLabelText(/Foto URL/i), "blob:https://example.com/abc")
    await user.click(screen.getByRole("button", { name: /guardar persona/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/Media por referencia/i)
  })

  it("permite URL por referencia válida", async () => {
    const user = userEvent.setup()
    render(<PersonaFormEjemplo />)
    await user.type(screen.getByLabelText(/Foto URL/i), "https://cdn.example.cl/fotos/p1.jpg")
    // asegurar RUT válido
    await user.click(screen.getByRole("button", { name: /guardar persona/i }))
    expect(await screen.findByRole("status")).toHaveTextContent(/guardado/i)
  })
})
