# ⚖️ 22 - Infracciones y Multas (IN)

El expediente disciplinario de la comunidad: cataloga las faltas al Reglamento de Copropiedad, documenta cada evento con evidencias y aplica sanciones económicas estandarizadas con respaldo de la directiva.

## 🚀 Funcionalidad Principal

Cada infracción nace con folio único `IN-####` en estado En Revisión, amarrada a la unidad infractora, con fecha/hora del suceso, antecedentes detallados (mín. 20 caracteres) y evidencias por referencia D1. Puede venir del catálogo de faltas o ser un cobro directo por daños con costo exacto y respaldo obligatorio.

## 🛠️ Secciones

- **Registro**: bandeja con filtros y detalle/expediente trazable; formulario dual (falta del catálogo vs daño directo) con conversión desde reclamos del buzón CO (arrastra folio, asunto y cuerpo como antecedentes).
- **Panel Directiva**: incidentes en curso con contadores por estado/categoría, montos comprometidos, comentarios internos privados y votos de respaldo.
- **Catálogo de faltas**: parametrizable con nombre, categoría (Leve/Grave/Gravísima) y sanción base (Monto Fijo $ o Porcentaje % del Gasto Común); seed NSGC incluido (ruidos molestos, mascotas, basura, áreas comunes, obras sin autorización).

## 🔌 Máquina de estados en la capa de datos (API)

El expediente se resuelve también en el servidor, con **un evento de auditoría por request**:

- **Apelar (`POST /api/in/infracciones/[id]/apelar`)**: solo desde En Revisión y con descargos ≥10 caracteres → Apelada (`IN_APELACION`).
- **Respaldar (`POST …/[id]/respaldar`)**: exige miembro vigente de la directiva y que la infracción siga sin resolución final (`IN_RESPALDO_DIRECTIVA`).
- **Aplicar (`POST …/[id]/aplicar`)**: mismo cálculo del store (monto fijo, costo por daños o % GC sobre el último cargo GC emitido, leído de BD), respaldo obligatorio en Grave/Gravísima, y materializa el cobro `multa_in` al Fondo de Gasto Común **en la misma transacción** e **idempotente por procedencia** (`origenRef`): reaplicar o recrear la infracción con el mismo id no duplica (`IN_APPLY_FINE`).
- **Desestimar (`POST …/[id]/desestimar`)**: justificación obligatoria → Desestimada (`IN_DESESTIMADA`).

**Higiene TEST**: la purga del laboratorio barre los cobros por procedencia (`test-*`), sin depender del período. **Nota declarada**: la ruta resuelve el Fondo de Gasto Común como el primer fondo `gasto_comun` activo; el laboratorio valida por tipo, no por id.

## 💡 Tips de Oro

- **Estados estrictos**: En Revisión → Apelada (descargos del vecino) → Aplicada o Desestimada; ya resueltas no admiten segunda resolución.
- **Graves con quórum directivo**: multas Grave/Gravísima exigen ≥1 respaldo de miembro vigente de la directiva antes de aplicarse; los comentarios internos son exclusivos de admin/directiva.
- **Aplicar fija el monto**: monto fijo del catálogo o costo del daño; el % GC se convierte a pesos contra el último GC emitido de la unidad (sin historial usa el valor nominal). Toda aplicación genera el cobro real de multa en FI y materializa `cargoFIReferencia` con su id; además notifica al propietario vigente de la unidad (pasa por gate AD).
- **Desestimación exige justificación**: queda escrita en el expediente.
- **Tipo en uso no eliminable**: el catálogo bloquea borrar faltas con infracciones registradas.
- **Auditoría**: `IN_REG_EVENT`, `IN_APELACION`, `IN_APPLY_FINE`.

## 🔗 Dependencias

- Unidad infractora de **EF**, reportantes de **MP**, directiva vigente de **GD** (`datosGobernanza`).
- Reclamos verídicos desde `mensajesBuzonCO` de **CO - Comunicación Vecinos**.
- Notificaciones con `notify()` (**ST**, D3).

