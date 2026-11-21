# Pruebas manuales — lote «catálogos de estados» (2026-11-21)

Checklist para validar a mano lo que tocó el lote de 22 hallazgos. Todo lo de acá está
empujado en `main` y la suite automática está en verde (364 archivos / 3436 tests); lo que
sigue es lo que **una máquina no puede ver**: que la pantalla diga lo que tiene que decir.

> **Cómo usar esta página:** tildá cada casilla. Si algo falla, anotá el bloque y el número,
> y capturá **las tres cosas** de la sección *Cómo reportar un fallo*.

---

## 0. Antes de arrancar

- [ ] Cliente de Prisma en **postgres**: `node scripts/preparar-cliente.mjs postgres` (en `k0mp4ss_fe/apps/web`).
- [ ] `DATABASE_URL` apuntando a la rama de desarrollo, y migraciones al día (`npx prisma migrate status`).
- [ ] Server de dev levantado (`npm run dev` en `apps/web`) y sesión con rol **administrador**.
- [ ] Segunda sesión (o ventana privada) con rol **residente** para los checks de alcance.

**Datos que esta base NO tiene** (no son fallas): las tablas de **acuerdos**, **convenios** y
**cuotas de convenio** están vacías. Los bloques que dependen de ellas están marcados
«requiere sembrar».

---

## Bloque A — Lo que cambió visible (mirar con lupa)

### A1. Vínculo de una unidad · el estado de ocupación ya no viene regalado

**Ruta:** `/comunidad/personas/[id]` → vincular unidad con rol **Propietario**.

- [ ] El selector «Estado Ocupación de la Propiedad» arranca **vacío** (antes decía `Habitada`).
- [ ] Las opciones son las del maestro de la comunidad: `Habitada`, `Próxima Vacancia`, `En Arriendo`, `Arrendada`, `En Venta`.
- [ ] Si guardás sin elegir → aparece el mensaje **«Elegí el estado de ocupación de la propiedad: sale del maestro de la comunidad.»** y no guarda.
- [ ] Si elegís una y guardás → el vínculo queda con esa fila y el filtro de ocupación la encuentra.

### A2. Cobranza de un cobro · el rebote se pinta, no se escupe

**Ruta:** `/finanzas/gastos-comunes` → cobranza de una unidad con deuda vencida.

- [ ] Con un canal apagado, el resumen dice `visor Omitido (motivo)` o `email Omitido (motivo)`.
- [ ] Sin emisor SMTP, el email sale como `Pendiente` — **nunca** como enviado.
- [ ] Si el SMTP rechaza, sale `email Fallido (motivo del servidor)`. Lo que **no** debe verse es `email fallido` en crudo.
- [ ] Repetir la misma gestión sin «reenviar» → `Ya registrado`.

### A3. Adelantos · el parcial se ve como descuento

**Ruta:** `/finanzas/remuneraciones` → tabla de adelantos.

- [ ] Un adelanto `pendiente` se ve como pendiente.
- [ ] Uno `descontado_parcial` se ve **como con descuento** (antes se veía sin descuento).
- [ ] Uno `saldado` se ve cerrado.
- [ ] Uno `desestimado` sigue listado (baja con historia, no se borra).

### A4. Reportes RE · menos destinatarios, y es correcto

**Ruta:** `/admin/reporteria` → generar un reporte con perfil **Residentes** + tenencia **Solo propietarios**.

- [ ] El reporte se genera y `distribuidoA` **no** queda en 0.
- [ ] Los destinatarios son sólo propietarios: **no** entran arrendatarios.
- [ ] Una persona con la cuenta `inactiva` o `bloqueada` **no** recibe el reporte (probala antes con la misma persona activa, para ver la diferencia).
- [ ] Con perfil **Residentes** y **sin** tenencia, entran propietarios y arrendatarios (es «cualquier vínculo vigente»).
- [ ] Con perfil **Trabajador de servicio**, entra quien tiene rol `personal`, aunque no viva en la comunidad.

---

## Bloque B — Lo que NO debería haber cambiado (regresiones)

- [ ] `/comunidad/personas`: las pestañas de rol son las mismas seis y filtran bien (`?rol=`); el filtro por estado de cuenta muestra los contadores correctos y **no** dice `ACTIVOS/INACTIVOS/BLOQUEADOS`.
- [ ] Alta y edición de persona: el estado de cuenta ofrece las tres opciones con sus textos y guarda la elegida.
- [ ] `/admin/gestion`: el filtro por rol del directorio muestra **Propietario / Residente / Directiva / Personal** y filtra; no aparece `Contratista` (no pertenece al directorio).
- [ ] `/admin/permisos`: la matriz sigue mostrando los cinco nombres formales (`Administrador Maestro`, `Miembro del Comité`, `Conserjería / Seguridad`, `Propietario / Residente`, `Personal de Mantención`).
- [ ] `/comunidad/directiva`: la ficha de gobernanza ofrece los cuatro cargos; el período de la directiva acepta el mismo cargo que la ficha (probá el mismo cargo en las dos).
- [ ] `/comunidad/archivo`: el diálogo de envío ofrece **Visor de la comunidad** y **Correo electrónico**; el resultado por destinatario muestra etiqueta (`Entregado` / `Pendiente` / `Fallido` / `Ya registrado`), nunca el valor crudo.
- [ ] `/operaciones/reservas`: reservar el **mismo elemento, día y horario** que otra reserva vigente debe rechazarse por solape; con la primera **cancelada**, debe permitirse.
- [ ] `/finanzas/multas`: una infracción `aplicada` o `desestimada` no se puede volver a aplicar ni desestimar; una `en revisión` o `apelada` sí.
- [ ] `/comunidad/visor` y `/visor-mensajes`: un aviso vencido pasa a archivado y deja de verse en el visor del residente.
- [ ] `/admin/gestion/presupuestos`: sólo se puede crear presupuesto desde un acuerdo **aprobado** y de cuerpo Comité o Asamblea.

---

## Bloque C — Requiere sembrar datos

Estas pantallas no se pueden validar con la base actual (tablas vacías). Sembrar primero:

- [ ] **Convenios** (`/admin/gestion/convenios`): crear convenio → anular. Las cuotas `pendiente` y `vencida` deben quedar `anulada`; una `pagada` **no** se toca. Requiere: un acuerdo aprobado + cuotas.
- [ ] **Acuerdos** (`/comunidad/directiva/acuerdos`): un acuerdo aprobado habilita el convenio de pago y el corte de servicios; uno `abierto` los bloquea con el mensaje de siempre.
- [ ] **Cortes de servicio**: con un corte en `preaviso` no se puede crear un segundo corte del mismo servicio; revocar uno `preaviso` o `ejecutado` funciona, y sobre uno `revocado` responde 409.

---

## Cómo reportar un fallo

Para cada falla, las tres cosas juntas:

1. **Dónde**: bloque y número (ej. «A2, tercer ítem») y la ruta exacta.
2. **Qué viste**: el texto literal en pantalla, o el código y cuerpo de la respuesta si es una llamada a la API (pestaña Red → copiar respuesta).
3. **Con qué datos**: unidad/persona/registro con el que lo probaste (folio, RUT o id), para poder reproducirlo.

Con eso lo convierto en test rojo antes de tocar nada.

---

## Fuera del alcance de esta página

- Los papeles firmados (encabezado, firmante derivado) y el nombre único de la comunidad: son la unidad de `identidad-unica`, ya cerrada, y no las tocó este lote.
- Rendimiento y concurrencia: no hubo cambios de performance; si algo se siente más lento, es ambiente, no este lote.
