"use client"

import { signOut } from "next-auth/react"
import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { IconLogout } from "@tabler/icons-react"

export function CerrarSesion() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => signOut({ callbackUrl: "/ingresar" })}
          aria-label="Cerrar sesión"
        >
          <IconLogout />
          <span className="sr-only">Cerrar sesión</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        Cerrar sesión
      </TooltipContent>
    </Tooltip>
  )
}
