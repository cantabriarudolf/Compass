# 42 — Puesta en marcha por rol

Guía para probar el sistema **como lo recibe un cliente**: en el orden en que un administrador
real carga su comunidad, y después cada rol en el orden en que depende del anterior. No se puede
probar a un residente antes de que existan el padrón y los vínculos, ni al comité antes de que
exista la directiva.

Cada paso dice qué se hace, dónde, **qué se verifica** y qué bloquea al siguiente. Si un paso no
se puede hacer, se anota: eso es información del producto, no del ánimo de quien prueba.

---

## Fase 0 — La primera cuenta

La primera cuenta no se crea desde una pantalla, y es deliberado: en ese momento todavía no hay
sesión que autorice nada, y un alta pública sería una puerta abierta en el momento más vulnerable.
Se crea con un acto de operador, desde `k0mp4ss_fe/apps/web`:

```bash
npx vite-node --config vitest.config.ts scripts/crear-admin.mjs \
  --comunidad-id=comunidad-x \
  --comunidad-nombre="Comunidad X" \
  --admin-email=admin@dominio.cl \
  --base-url=https://app.dominio.cl
```

En **una transacción** crea la comunidad si no existe, crea la cuenta administradora **sin
contraseña y sin ficha** —existe antes que el padrón—, emite su invitación y deja el evento
`cuenta_inicial_creada`. Imprime el enlace `https://…/invitacion?token=…`, que es la página donde
la persona define su contraseña: el enlace es de un solo uso y vence a las **72 horas**. Y **se
niega a crear una segunda cuenta**: si la comunidad ya tiene alguna, sale con código 1 sin
escribir nada.

Se verifica: antes de abrir el enlace la cuenta no puede entrar —el login la rechaza porque no
tiene contraseña, que es el «cambio forzado» sin columna de por medio—; al definirla entra como
administradora; el enlace usado, vencido o inventado responde el mismo rechazo. Si la corrida
falla, no queda comunidad, cuenta ni invitación a medias.

**El envío del enlace por correo es F43** y todavía no existe: el script lo imprime y quien opera
lo entrega por un canal seguro. Es deuda declarada, no una función en curso.

---

## Fase 1 — Administrador de la comunidad

El rol `administrador` tiene permiso total sobre su comunidad. Es el único que puede hacer todo lo
que sigue, y cada bloque depende del anterior.

| # | Qué se hace | Dónde | Se verifica |
|---|---|---|---|
| 1.1 | Configurar la comunidad: nombre, dirección, datos de contacto, reglamento vigente con su versión | `/admin/configuracion` | El nombre aparece en los documentos que se emitan después |
| 1.2 | Cargar la estructura: torres o sectores, pisos, **unidades con su prorrateo**, estacionamientos y sus tipos | `/admin/estructura`, `/admin/maestros` | La suma de prorrateos de las unidades cierra en 100; sin eso el reparto de gastos comunes no cuadra |
| 1.3 | Cargar los maestros que consumen personas y finanzas: AFP, previsiones de salud, bancos, feriados, condiciones especiales | `/admin/maestros` | Cada maestro tiene sus registros y sus códigos; nada de listas vacías que después fallen en un select |
| 1.4 | Cargar el **padrón de personas**: RUT validado, nombres, email, teléfono | `/comunidad/personas` (carga masiva por CSV) | Una persona no se duplica por RUT; el listado muestra el total del servidor, no el de la página |
| 1.5 | Cargar los **vínculos**: quién es propietario o arrendatario de qué unidad y desde cuándo | `/comunidad/personas` → vínculo | Un vínculo con fecha de término deja de dar derechos; el propietario vigente es el que responde ante la unidad |
| 1.6 | Registrar la **directiva**: período y cargos de cada miembro | `/comunidad/directiva` | El período vigente es uno solo; sin directiva no hay acuerdo de comité posible (y sin acuerdo no hay corte de servicios ni convenio) |
| 1.7 | Crear las **cuentas de acceso** y asignar el rol de cada una | `/admin/usuarios` (**Sistema → Cuentas y acceso**) | Cada alta emite su invitación y la fila muestra su estado: `pendiente`, `vencida` o `usada`, con sus fechas. Reenviar vence el enlace anterior en el mismo acto. Un residente con rol de acceso `residente` ve su unidad y no la del vecino |
| 1.8 | Cargar el **fondo de gasto común**, las partidas y el presupuesto del año | `/finanzas` | El presupuesto requiere acuerdo aprobado; la emisión del mes se contrasta contra él y avisa si lo excede, sin bloquear |
| 1.9 | **Emitir** el gasto común del mes y generar los avisos de cobro | `/finanzas` | El aviso es un documento con folio, congelado: lo que se emite no cambia después. Se descarga el PDF y se lee |
| 1.10 | Registrar **pagos** y ver la morosidad | `/finanzas/pagos` | Lo pagado baja la deuda; lo vencido aparece como moroso; la suma de las cuotas de un convenio cierra al centavo |
| 1.11 | Cargar **egresos** e ingresos del período | `/finanzas` | La reportería muestra la salud de caja con esos movimientos |

**Lo que hay que mirar con lupa en esta fase**, porque es donde se rompe en silencio:

- El **prorrateo**: si no suma 100, cada cifra de dinero del sistema queda mal y no lo dice.
- El **padrón**: si una persona entra dos veces, aparece dos veces como morosa.
- El **saldo del residente**: su estado de cuenta tiene que coincidir con el de administración. Si
  uno dice una cosa y el otro otra, el sistema miente en algún lado.

**El matiz del paso 1.7:** la pantalla crea la cuenta y emite la invitación, pero el enlace no se lo
devuelve a la administración —a propósito: el administrador invita y no conoce la contraseña— y el
correo que lo transporta es F43. Hoy el enlace que se puede entregar es el del primer arranque;
para las cuentas siguientes, la invitación queda emitida y su estado visible a la espera de ese
correo. La pantalla lo dice en su propio texto en vez de declarar un aviso que no ocurrió.

---

## Fase 2 — Miembro del comité de administración

Depende de 1.6 (directiva con período vigente). El comité **no** crea personas ni emite gastos
comunes: lee, aprueba y acuerda.

| # | Qué se hace | Se verifica |
|---|---|---|
| 2.1 | Entrar y ver la portada: qué ve un comité que no ve el administrador | No aparecen acciones de alta que el servidor va a rechazar |
| 2.2 | Registrar un acuerdo del comité y votarlo | El folio `AD-<año>-####` lo asigna el servidor; el voto es inmutable y no se puede repetir |
| 2.3 | Cerrar un acuerdo **presencial** con su acta firmada | Sin el acta subida al archivo legal no cierra (409); con ella cierra y no admite votos |
| 2.4 | Aprobar el presupuesto del año | El administrador puede después emitir contra ese presupuesto |
| 2.5 | Leer los reportes que el comité tiene derecho a ver | Ve el estado de la comunidad; no ve datos de una comunidad ajena |

---

## Fase 3 — Conserjería

Depende de 1.2 (estructura) y 1.4 (padrón). Opera el día a día.

| # | Qué se hace | Se verifica |
|---|---|---|
| 3.1 | Registrar la bitácora del turno | Queda con fecha, responsable y unidad |
| 3.2 | Recibir una encomienda y entregarla | El residente ve el aviso; la entrega cierra el registro |
| 3.3 | Registrar una visita | La unidad destino se busca en el servidor, no en una lista recortada |
| 3.4 | Gestionar una reserva | La reserva respeta el calendario y la autorización del elemento |

---

## Fase 4 — Residente (copropietario)

Depende de 1.4, 1.5, 1.7 y 1.9. Es el rol que **más se beneficia** de que las fases anteriores
estén bien: si el padrón o el prorrateo están mal, el residente lo ve primero.

| # | Qué se hace | Se verifica |
|---|---|---|
| 4.1 | Entrar y ver su estado de cuenta | Ve **sólo** sus cargos; el saldo coincide con el de administración |
| 4.2 | Descargar su aviso de cobro | El papel trae su folio y, si tiene convenio vigente, lo declara con la cuota que va |
| 4.3 | Emitir un certificado de residencia o de deuda | El certificado de deuda sale con el saldo real; el «Al Día» sólo se emite si no debe |
| 4.4 | Hacer una solicitud o un reclamo | El reportante es quien está logueado, nunca la primera fila del padrón |
| 4.5 | Reservar un espacio común | Si tiene deuda vencida, la regla de la comunidad decide |
| 4.6 | Actualizar sus datos personales | Sus datos sensibles no quedan visibles para otro residente |

---

## Fase 5 — Mantención

Depende de 1.2 y de que exista inventario.

| # | Qué se hace | Se verifica |
|---|---|---|
| 5.1 | Registrar un trabajo de mantenimiento con su responsable | El responsable se elige entre el **personal con ficha**, no entre todo el padrón |
| 5.2 | Consumir un insumo del inventario | El stock baja y queda el movimiento |
| 5.3 | Entregar un elemento de protección personal | La entrega queda asociada a la persona y al elemento |

---

## Cómo registrar lo que encontrás

Para que la prueba sirva, cada hallazgo va con tres datos: **en qué paso estaba** (el número de la
tabla), **qué esperaba** y **qué pasó**. Sin el número de paso, un hallazgo no se puede reproducir,
y sin la expectativa no se puede saber si es un error o una decisión del producto.

Regla de orden: si un paso de la Fase 1 falla, **no se salta a la Fase 4**. Un residuo de la fase
anterior contamina todo lo que viene y se lee como un error del módulo equivocado.

---

## Lo que esta guía todavía no puede cubrir

- **F43 — el correo que transporta la invitación.** La Fase 0 y el paso 1.7 ya tienen cómo hacerse
  (el script del primer arranque y la pantalla de cuentas), pero el enlace se entrega a mano porque
  no hay correo que lo lleve. El texto del correo se redacta después de la consulta al especialista
  en administración de comunidades, porque explica obligaciones del rol y toca datos personales.
