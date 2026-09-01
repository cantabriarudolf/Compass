"use client"

import { useEffect } from "react"
import { iniciarSyncAuditoria } from "@/lib/auditoria-sync"

export function AuditoriaSyncInit() {
  useEffect(() => {
    const off = iniciarSyncAuditoria()
    return () => {
      if (typeof off === "function") off()
    }
  }, [])
  return null
}
