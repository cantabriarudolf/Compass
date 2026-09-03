import { FIEspejoBD } from "@/components/fi-espejo-bd"

export default function FinanzasPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-sm text-muted-foreground">
          Verificación del espejo de datos de Finanzas en la capa de datos persistente (ST).
        </p>
      </div>
      <FIEspejoBD />
    </div>
  )
}
