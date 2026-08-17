export const PALETA_HEX = [
  "#10b981",
  "#2563eb",
  "#a855f7",
  "#0891b2",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#22c55e",
  "#e11d48",
  "#0ea5e9",
  "#84cc16",
  "#7c3aed",
  "#f43f5e",
]

export function hexDesdeId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETA_HEX[h % PALETA_HEX.length]!
}