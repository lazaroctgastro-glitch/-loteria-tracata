# Modelo de datos y modelo contable

> Documento de diseño previo a la implementación.
> Prioridad absoluta: **trazabilidad y fiabilidad de las cifras**.

## 1. Principio fundamental: contabilidad por movimientos

No se guarda **ningún** saldo ni contador acumulado. La única fuente de verdad es la
tabla `movements`, que es un **libro mayor append-only** (no se puede actualizar ni
borrar: hay triggers que lo impiden).

Todo lo demás (stock central, stock por bar, décimos vendidos, caja pendiente,
caja central, capital recuperado, comisiones, fondo fiesta) se **calcula sumando**
movimientos mediante vistas SQL.

### 1.1. Cada movimiento guarda sus "efectos" como deltas con signo

En lugar de que la aplicación interprete el tipo de movimiento para saber qué sumar
o restar, **cada fila guarda explícitamente el efecto que produce**:

| Columna                  | Significado                                                   |
| ------------------------ | ------------------------------------------------------------- |
| `d_purchased_qty`        | Décimos que entran al sistema (solo compras)                   |
| `d_central_qty`          | Variación del stock del almacén central                        |
| `d_establishment_qty`    | Variación del stock del establecimiento de la fila             |
| `d_sold_qty`             | Variación de décimos vendidos                                  |
| `d_written_off_qty`      | Variación de décimos dados de baja (pérdidas / ajustes)        |
| `d_pending_cents`        | Variación del dinero pendiente de recoger en el establecimiento|
| `d_central_cash_cents`   | Variación del efectivo de la caja central                      |
| `d_revenue_cents`        | Variación de la facturación (ventas a PVP)                     |
| `d_capital_cents`        | Variación del capital recuperado (parte del coste)             |
| `d_commission_cents`     | Variación de la comisión generada (fondo fiesta)               |
| `d_fund_expense_cents`   | Variación de los gastos cargados al fondo fiesta               |

Ventajas de este diseño:

1. **Los informes son sumas puras.** Ninguna lógica de negocio se duplica en la app.
2. **La anulación es trivial y perfectamente trazable**: se inserta un movimiento
   nuevo con todos los deltas negados y `reverses_movement_id` apuntando al original.
   Nunca se borra nada.
3. **La integridad se garantiza a nivel de fila** con dos `CHECK` (ver 1.2), por lo
   que el descuadre global es *imposible por construcción*.

### 1.2. Invariantes garantizados por la base de datos

```sql
CHECK (d_purchased_qty = d_central_qty + d_establishment_qty
                       + d_sold_qty + d_written_off_qty)   -- invariante de inventario
CHECK (d_revenue_cents = d_capital_cents + d_commission_cents) -- invariante de dinero
```

Como cada fila cumple el invariante, la suma de todas las filas también lo cumple:

```
DÉCIMOS COMPRADOS = STOCK CENTRAL + STOCK EN BARES + VENDIDOS + BAJAS
FACTURACIÓN       = CAPITAL RECUPERADO + COMISIONES
```

La pantalla de Configuración muestra un panel de **Control de integridad** que
ejecuta estas comprobaciones sobre los datos reales (vista `v_integrity_check`).

## 2. Efectos de cada tipo de movimiento

Con `n` = décimos, `PC` = precio de compra, `PV` = precio de venta, `C = PV - PC`:

| Tipo               | Efectos                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------- |
| `purchase`         | `purchased +n`, `central +n`, `central_cash -(n·PC)`                                      |
| `capital_injection`| `central_cash +importe` (aportación de dinero propio al proyecto)                          |
| `delivery`         | `central -n`, `establishment +n`                                                          |
| `return`           | `central +n`, `establishment -n`                                                          |
| `sale`             | `establishment -n`, `sold +n`, `revenue +n·PV`, `capital +n·PC`, `commission +n·C`, `pending +n·PV` |
| `count`            | Movimiento de auditoría con todos los deltas a 0 (registra el recuento físico)            |
| `adjustment`       | `written_off ±n` contra `central` o `establishment`                                       |
| `withdrawal`       | `pending -importe`, `central_cash +importe`                                               |
| `fund_expense`     | `fund_expense +importe`, `central_cash -importe`                                          |

Un movimiento de anulación tiene **el mismo `type`** que el original y todos los
deltas negados, de forma que cualquier informe filtrado por tipo queda
automáticamente neto de anulaciones.

## 3. Separación capital / comisión

Físicamente el dinero está mezclado, pero contablemente cada décimo vendido a 23 €
se descompone siempre en:

- **20 € capital recuperado** — recupera el coste del décimo.
- **3 € comisión** — alimenta el **Fondo Fiesta**.

Estos importes se derivan **siempre** de los precios de la campaña
(`sale_price_cents - purchase_price_cents`), nunca están hardcodeados, y se
congelan en el movimiento en el momento de la venta (`unit_price_cents`), de modo
que cambiar los precios de una campaña futura no altera el histórico.

## 4. Los dos niveles de caja

### 4.1. Caja de lotería del establecimiento (`pending_cents`)

```
CAJA PENDIENTE = Σ d_pending_cents  (ventas suman, retiradas restan)
```

Es el dinero que **debería haber físicamente** en la caja de lotería del bar.
Nunca se mezcla con la caja del restaurante: es una cuenta propia de la aplicación.

Si una retirada no coincide con lo esperado, **solo se resta lo realmente retirado**,
de modo que la diferencia permanece viva como pendiente. Nunca se "cuadra" a la
fuerza ni se borra una diferencia.

### 4.2. Caja central (`central_cash_cents`)

```
CAJA CENTRAL = Σ d_central_cash_cents
             = aportaciones + retiradas de bares - compras - gastos del fondo
```

### 4.3. Fondo Fiesta

```
SALDO FONDO FIESTA = Σ d_commission_cents - Σ d_fund_expense_cents
```

El fondo fiesta es una **marca contable sobre la caja central** (el dinero está
dentro de la caja central, pero se sabe cuánto de él pertenece al fondo).

## 5. Tablas

| Tabla                 | Contenido                                                            |
| --------------------- | -------------------------------------------------------------------- |
| `profiles`            | Usuario de la app (1:1 con `auth.users`), rol `admin` / `manager`     |
| `user_establishments` | Qué establecimientos puede ver cada responsable                       |
| `establishments`      | Bares/restaurantes. Se pueden archivar; solo se borran sin movimientos|
| `campaigns`           | "Lotería de Navidad 2026" + precios de compra/venta de la campaña     |
| `lottery_numbers`     | Números de 5 cifras de cada campaña (único por campaña)               |
| `movements`           | **Libro mayor append-only.** Fuente de verdad de todo                 |
| `fund_expense_items`  | Concepto de cada gasto del fondo fiesta (detalle del movimiento)      |
| `count_lines`         | Detalle del recuento físico (esperado vs contado por número)          |

`purchases`/`sales`/`cash_withdrawals` no son tablas separadas: son **tipos de
movimiento** del libro mayor. Esto elimina por completo la posibilidad de que una
tabla de resumen se desincronice del histórico. Las operaciones que agrupan varias
líneas (una compra de 3 números, un recuento) comparten un `group_id`.

## 6. Vistas de cálculo

| Vista                       | Uso                                                        |
| --------------------------- | ---------------------------------------------------------- |
| `v_stock_central`           | Stock del almacén central por número                        |
| `v_stock_establishment`     | Stock por establecimiento y número                           |
| `v_establishment_summary`   | Tarjeta de cada bar (entregados, stock, vendidos, caja...)   |
| `v_number_summary`          | Informe por número de lotería                                |
| `v_campaign_summary`        | Indicadores del dashboard                                    |
| `v_fund_summary`            | Fondo fiesta: generado, gastado, saldo, % por bar             |
| `v_integrity_check`         | Control automático de descuadres                             |

Todas las vistas usan `security_invoker = true`, por lo que **respetan la RLS del
usuario que consulta**: un responsable de bar solo ve sus propias cifras aunque
consulte una vista global.

## 7. Concurrencia: por qué el stock nunca puede quedar negativo

Todas las escrituras pasan por funciones `SECURITY DEFINER` que, antes de validar
el stock disponible, toman un **advisory lock transaccional** sobre la clave
afectada (`campaña+número` para el central, `establecimiento+número` para el bar).

```
pg_advisory_xact_lock(hashtextextended(clave, 0))
   -> SELECT sum(deltas)  (stock actual)
   -> comprobar que la operación no lo deja negativo
   -> INSERT del movimiento
```

Dos usuarios vendiendo el mismo número a la vez se serializan en el lock, por lo
que la segunda transacción ve el stock ya descontado y falla limpiamente en vez de
generar stock negativo.

## 8. Situaciones de descuadre previstas

| Situación                                        | Tratamiento                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Faltan décimos en el bar sin venta registrada     | Recuento: se proponen como ventas y el usuario **confirma**          |
| Sobran décimos respecto a lo esperado             | Recuento: genera un `adjustment` de auditoría, nunca silencioso      |
| Se retira menos dinero del esperado               | La diferencia sigue viva en la caja pendiente del bar                |
| Se retira más dinero del esperado                 | La caja pendiente queda en negativo y se marca en rojo (a favor)     |
| Movimiento registrado por error                   | `Anular movimiento` → movimiento inverso, nunca borrado              |
| Décimo perdido / roto                             | `adjustment` con baja explícita y motivo obligatorio                 |
