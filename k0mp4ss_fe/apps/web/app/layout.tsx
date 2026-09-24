import { Geist_Mono, Inter } from "next/font/google"
import type { Metadata } from "next"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { CommunityHeader } from "@/components/community-header";
import { Separator } from "@workspace/ui/components/separator";
import { ModeToggle } from "@/components/mode-toggle";
import { CerrarSesion } from "@/components/cerrar-sesion";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { AuditoriaSyncInit } from "@/components/auditoria-sync-init";
import { ConsentBanner } from "@/components/consent-banner";
import { FISyncInit } from "@/components/fi-sync-init";
import { auth } from "@/lib/auth";

// Título por defecto para TODAS las páginas (axe document-title): las páginas
// client no exportan metadata propia — el default del root layout las cubre.
export const metadata: Metadata = {
  title: {
    default: "GECOS — Sistema de Gestión de Condominios",
    template: "%s · GECOS",
  },
  description: "Sistema de gestión de comunidades: finanzas, operaciones, comunidad e inventario.",
}

const inter = Inter({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth().catch(() => null)
  const roles: string[] = Array.isArray(session?.user?.roles) ? session.user.roles : []
  const logueado = Boolean(session?.user?.id)
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <AuditoriaSyncInit />
        <FISyncInit />
        <ThemeProvider>
          <TooltipProvider>
                <SidebarProvider>
                  {logueado && <AppSidebar roles={roles} />}
                  <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                      {logueado && (
                        <>
                          <SidebarToggle />
                          <Separator orientation="vertical" className="mr-2 h-4" />
                        </>
                      )}
                      <div className="flex-1">
                        <CommunityHeader />
                      </div>
                      <ModeToggle />
                      {logueado && <CerrarSesion />}
                    </header>
                <main className="flex-1 overflow-auto p-4">
                  {children}
                </main>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
        </ThemeProvider>
        <ConsentBanner />
      </body>
    </html>
  )
}
