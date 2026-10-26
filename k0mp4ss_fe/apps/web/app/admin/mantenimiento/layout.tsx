// F9 — aislamiento del módulo QA/dev: sólo administrador, fuera de producción.
// El guard de servidor corta con 404 sin filtrar la existencia de la ruta.
import { QaDevGuard } from "../_qa-dev-guard"

export default function Layout({ children }: { children: React.ReactNode }) {
  return <QaDevGuard>{children}</QaDevGuard>
}
