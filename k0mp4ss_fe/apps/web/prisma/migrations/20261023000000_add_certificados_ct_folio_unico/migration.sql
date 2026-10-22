-- Certificados CT: folio correlativo único POR COMUNIDAD (CT-####).
--
-- Contexto (auditoría "funciones de palo" 2026-10-23): el folio se calculaba en
-- el cliente con `max+1` sobre la lista cargada — colisiona entre dos clientes
-- emitiendo a la vez y deja huecos. El POST ahora lo asigna server-side, en una
-- transacción, por comunidad. Este índice es la garantía dura contra la carrera:
-- si dos transacciones leen el mismo máximo, la segunda choca con P2002 y el
-- handler reintenta con el número siguiente (nunca escribe un folio repetido).
--
-- Aditiva: SOLO crea un índice único; no altera columnas ni datos.
-- Requisito de despliegue: si una comunidad ya tiene folios duplicados (posible
-- con el cálculo cliente de `max+1`), el deploy falla y hay que renumerar esos
-- certificados antes de volver a correr `prisma migrate deploy`. La base de
-- desarrollo/tests se recrea desde cero (`scripts/e2e-fresh.mjs`,
-- `test/db-descartable-global.setup.ts`), así que no le aplica.

-- CreateIndex
CREATE UNIQUE INDEX "certificados_ct_comunidadId_folio_key" ON "certificados_ct"("comunidadId", "folio");
