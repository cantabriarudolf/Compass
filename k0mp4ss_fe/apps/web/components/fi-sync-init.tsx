"use client"

import { useEffect } from "react"
import { iniciarSyncFI } from "@/lib/fi-sync"

export function FISyncInit() {
  useEffect(() => {
    const off = iniciarSyncFI()
    return () => {
      if (typeof off === "function") off()
    }
  }, [])
  return null
}
