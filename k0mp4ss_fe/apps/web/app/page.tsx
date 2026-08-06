import { Button } from "@workspace/ui/components/button"

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-muted/50 p-8">
        <h1 className="text-2xl font-bold tracking-tight">Bienvenido a Compass</h1>
        <p className="text-muted-foreground mt-2">
          El sistema modular de gestión de condominios está listo para ser construido.
        </p>
        <div className="mt-6 flex gap-4">
          <Button>Empezar</Button>
          <Button variant="outline">Documentación</Button>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
      </div>
    </div>
  )
}
