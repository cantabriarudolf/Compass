# 📦 21 - Inventario y Recursos (IR)

El almacén de la comunidad: activos de infraestructura, herramientas, insumos con stock crítico, protección personal (EPP) y llaves/credenciales — todo vinculado a la Estructura Física y al Maestro de Personas.

## 🚀 Funcionalidad Principal

Un catálogo único con código `IR-A-####` por recurso y cuatro naturalezas: infraestructura (hidropack, cámaras…), mobiliario (con estados Disponible/En Uso/Reparación/Baja), insumos (stock + unidad de medida) y EPP; además llaves y credenciales amarradas a su unidad. Las compras registran proveedor/factura como metadatos D1 con cargo FI pendiente.

**Permisos**: conserjería y mantención registran las solicitudes y entregan; comité y residente solo consultan.

**Alcance por fila (permisos por objeto)**: el dueño de una solicitud de insumo es `solicitantePersonaId` (el modelo no tiene unidad) y el de una entrega de EPP es la persona a la que se le entregó el equipo (`personaId`). Administración y comité ven la comunidad completa; un rol acotado ve solo sus propias filas, y si su usuario no tiene ficha de persona no ve ninguna (falla cerrado: antes ese caso abría todas las de la comunidad). La fila ajena responde 404 —no 403— en la colección, el detalle y el PUT.

## 🛠️ Secciones

- **Catálogo**: grilla filtrable por naturaleza/estado; alta y edición por tipo de recurso (ubicación EF obligatoria para infraestructura, unidad obligatoria para llaves); cambio de estado con auditoría.
- **Stock crítico**: al crear un insumo se marca si es Crítico y su umbral; la Alarma de Reposición salta sola cuando una entrega deja el stock en o bajo el umbral (badge ⚠️ arriba del catálogo).
- **Solicitudes**: gestión trazable con folio `SI-0001`, `SI-0002`… que **genera el sistema** al crear la solicitud (nadie escribe el folio a mano): quién pide × qué artículo × área destino. Conserjería y mantención cierran el ciclo con *Entregar*: **un solo acto, sin segunda aprobación** — la entrega descuenta el stock **en la misma acción**, con validación de stock suficiente.
- **Comodín en un click**: artículos fuera de catálogo alertan al admin, que decide en el mismo momento: **Sustituir** (asigna el sustituto y lo entrega descontando su stock), **Rechazar** (cierra la solicitud sin descontar nada; justificación obligatoria) o **Aprobar y Crear** (alta del recurso en el catálogo con stock 0, listo para futuras solicitudes).
- **EPP**: entregas individuales (fecha/talla/estado); si el recurso define ciclo de renovación, cada entrega calcula su próxima renovación (vencidas destacadas).
- **Accesos**: vista "¿Quién tiene qué?" con asignación vigente; botón de devolución; panel de llaves no devueltas (fecha anterior a hoy).

## 💡 Tips de Oro

- **Alarma solo al cruzar**: `IR_STOCK_LOW` dispara cuando el stock pasa de sobre-el-umbral a bajo-el-umbral; no repite mientras siga bajo.
- **Folio del sistema**: el `SI-####` nace en el servidor; entregar dos veces la misma solicitud responde "ya entregada" sin volver a descontar stock.
- **Comodín = operativa sin freno**: la solicitud queda bloqueada hasta que el admin decida; aprobar y crear deja el artículo listo para futuras solicitudes (stock 0 inicial).
- **Entrega sin stock rechaza** indicando faltante; nada se muta parcialmente.
- **Referencia pendiente FI**: toda compra con factura marca `cargoFIReferencia:"pendiente"` (la vinculación contable del ingreso de recursos queda post-serie; la conexión de Sesión 5 cubrió IN/MT/RA).
- **Auditoría**: `IR_STOCK_LOW`, `IR_DELIVERY_EPP`, `IR_ASSET_REPAIR`, `IR_COMODIN_ALERTA` (+ baja auditada).
- **Cada uno ve lo que pidió o lo que recibió**: la solicitud de insumo se acota por quien la pidió y la entrega de EPP por quien la recibió. Una fila ajena no se lee ni se edita: responde el 404 genérico, igual que un id que no existe.
- **El campo de persona no es auto-atribución** en estos dos recursos: en EPP es el receptor que registra un rol operativo, y el residente no tiene la clave de alta. Por eso no necesitaron guardia de creación, solo alcance de lectura.

## 🔗 Dependencias

- Ubicación de **EF** (micro sectores/unidades) y responsables de **MP**.
- Maestros **MA** (`unidadesMedida`) para insumos.
- **RP**: alcance por fila resuelto en el servidor (`app/api/ir/entregas-epp/_alcance.ts`, `app/api/ir/solicitudes-insumo/_alcance.ts`).
- Notificaciones con `notify()` (**ST**, D3).

