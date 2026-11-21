# 43 - Pauta de migración y marcha blanca

Esta es la pauta para **pasar de la planilla al sistema**. No es un manual de pantallas: es lo que hay
que decidir y hacer **antes**, para que la carga no deje dos verdades.

---

## 1. La regla que ordena todo: una fecha de corte

Se elige **un día** (la «fecha de corte»). Hasta ese día, la comunidad vive en la planilla. Desde el día
siguiente, vive en el sistema.

- **La deuda que se carga es la del día de corte**, no la de ayer ni la de fin de mes.
- **La primera emisión de gasto común del sistema es del período siguiente al corte.** Si el corte es
  el 31 de marzo, la primera emisión es abril. Si se emite marzo, marzo se cobra dos veces.

Sin una fecha de corte única, cada planilla que se carga trae su propio criterio y la deuda de una
unidad termina sumando dos veces el mismo mes.

## 2. La ventana de congelamiento

Durante la carga **no se opera en el sistema**: no se emite, no se cobra, no se registra ningún pago,
no se da de alta a nadie. Dura lo que dura la carga (una tarde, no una semana).

Por qué: un pago que entra en medio de la carga deja el saldo de apertura desactualizado por ese monto,
y nadie lo detecta hasta que el vecino reclama. **Una sola carga, con el sistema quieto, evita el
problema de raíz.**

Lo que sí puede seguir pasando: la vida del edificio (visitas, encomiendas, reservas). Lo que se
congela es **todo lo que mueve plata o padrón**.

## 3. Qué hay que preparar antes (todo junto, antes de empezar)

Cinco planillas en CSV y una lista de saldos. Las plantillas se descargan desde
`/admin/carga-inicial`; no hay que armarlas a mano.

| # | Qué | De dónde sale |
|---|---|---|
| 1 | **Estructura**: sectores y unidades | La planilla del edificio: torre/piso, número, rol SII, tipo, estado de ocupación |
| 2 | **Personas**: el padrón | Nómina de copropietarios y residentes, con RUT y correo |
| 3 | **Vínculos**: quién vive dónde | Qué persona es propietaria, arrendataria, ocupante de cada unidad |
| 4 | **Egresos**: gastos históricos | El libro de gastos de los años que se quieran cargar |
| 5 | **Ingresos**: plata que entró | El libro de ingresos de esos años |
| 6 | **Saldos de apertura** | Una fila por unidad: cuánto debe a la fecha de corte |

**Antes de la ventana**, dos cosas que el sistema no puede adivinar y que deben existir cargadas:
los **tipos de unidad** y los **estados de ocupación** de esa comunidad. Si faltan, la estructura se
rechaza con el motivo, fila por fila.

## 4. El orden (no es opcional)

```
1. Catálogo del país        (un botón en Maestros: AFP, salud, bancos, índices, feriados)
2. Tipos de unidad y estados de ocupación
3. Estructura               (crea los sectores y las unidades)
4. Personas                 (el padrón)
5. Vínculos                 (falla si falta la persona o la unidad)
6. Egresos e ingresos       (el histórico de movimientos)
7. Saldos de apertura       (la deuda a la fecha de corte)
8. Configuración            (identidad, firmante, casilla de correo)
9. Fondos                   (sin fondo de gasto común no se puede emitir)
10. Acuerdo aprobado → presupuesto
11. Primera emisión         (del período siguiente al corte)
12. Usuarios                (para que cada vecino entre y vea su deuda)
```

Cada paso deja el sistema en un estado coherente. Si algo falla, se corrige y **se vuelve a subir el
mismo archivo**: las cargas son idempotentes (no duplican lo que ya estaba) y todas tienen vista previa
que **no escribe**.

## 5. Cómo saber que salió bien

Antes de dar la ventana por cerrada, cinco verificaciones:

1. **La vista previa de cada planilla terminó sin errores.** Si hay una fila con error, se corrige la
   fila, no se importa «lo que se pueda».
2. **Los números coinciden**: unidades cargadas = unidades de la planilla; personas = padrón;
   vínculos = cada unidad con al menos un propietario.
3. **La deuda total del sistema = la deuda total de la planilla** a la fecha de corte.
4. **El arranque no tiene faltantes**: `/admin/arranque` en cero (o sólo los pasos que se deciden no usar).
5. **Un vecino de prueba entra y ve su unidad y su deuda.** Si eso funciona, el resto es repetir.

## 6. Lo que el sistema **no** trae y conviene saber antes

- **Gobernanza**: directiva, períodos y actas se cargan a mano, uno por uno.
- **Ficha laboral** del personal: se carga sobre cada persona, a mano.
- **Fotos, PDF y documentos**: se suben a mano, uno por uno.
- **Medidores y etiqueta de sector**: el CSV no los trae; se completan por unidad después.
- **Pagos históricos**: se cargan los saldos, no cada pago. El detalle de un pago viejo no vive en el
  sistema; el saldo sí.

## 7. Si la carga se hace más adelante y no al arranque

Se puede. No hay nada que lo impida técnicamente. Lo único que cambia: **hasta esa carga, el sistema
no ve a los morosos de antes**. Se opera con la deuda nueva y la vieja queda en la planilla — o sea, se
vuelve al problema de las dos verdades, que es justo lo que esta pauta evita.

**Por eso el momento natural de la carga es el arranque**, y por eso la ventana se acuerda primero con
la administración: no es una tarea de sistemas, es un acuerdo sobre cuándo se deja de usar la planilla.
