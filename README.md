# 🎄 Lotería Tracatá

Aplicación web instalable (PWA) para gestionar la venta de **Lotería de Navidad** en varios
bares y restaurantes: cuántos décimos compras, cuántos tiene cada local, cuánto ha vendido,
cuánto dinero debe haber en su caja, cuánto retiras y cuánto se acumula para la fiesta del
personal.

La contabilidad de la lotería está **completamente separada de la caja del restaurante**:
tiene su propia «Caja de Lotería».

---

## Qué resuelve

| Necesidad                                        | Dónde está en la aplicación                |
| ------------------------------------------------ | ------------------------------------------- |
| Cuántos décimos compro y de qué números          | **Comprar lotería** e **Inventario**        |
| Cuántos tiene y ha vendido cada establecimiento  | **Inicio** (tarjeta de cada bar)            |
| Cuánto dinero debería haber en cada caja         | «CAJA PENDIENTE» de cada tarjeta            |
| Cuánto retiro y cuánto queda pendiente           | **Retirar dinero**                          |
| Cuánto capital recupero y cuánta comisión genero | **Caja central**                            |
| Cuánto se lleva acumulado para la fiesta         | **Fondo Fiesta**                            |
| Qué pasó, cuándo y quién lo hizo                 | **Movimientos** (histórico completo)        |
| Comprobar que no falta nada                      | **Configuración → Control de integridad**   |

---

## Cómo están hechas las cuentas

Cada décimo se compra a **20 €** y se vende a **23 €**. Esos 3 € de diferencia van al
**Fondo Fiesta**. Los precios **no están fijos en el código**: se configuran en cada campaña
y la aportación a la fiesta siempre se calcula como `precio de venta − precio de compra`.

Hay dos niveles de caja, claramente separados:

1. **Caja de lotería del establecimiento.** Cada venta suma 23 € a lo que ese bar debe tener
   guardado. Cuando pasas a recoger el dinero, esa caja baja por lo que realmente te llevas.
   Si retiras menos de lo esperado, **la diferencia sigue viva**: nunca se cuadra a la fuerza.
2. **Caja central.** El dinero del proyecto: entra lo que recoges de los bares (y lo que
   aportas tú), y sale lo que gastas comprando más lotería o en la fiesta.

Todo esto se apoya en un principio: **no se guarda ningún saldo**. Existe un único libro de
movimientos al que solo se añade, y todas las cifras se calculan sumándolo. Dos reglas que la
base de datos comprueba en **cada** movimiento hacen que el descuadre sea imposible:

```
décimos comprados = almacén central + establecimientos + vendidos + bajas
facturación       = capital recuperado + Fondo Fiesta
```

El diseño completo está explicado en **[`docs/MODELO-DE-DATOS.md`](docs/MODELO-DE-DATOS.md)**.

Detalles importantes:

- **El dinero se guarda en céntimos enteros**, nunca con decimales de coma flotante.
- **Nada se borra.** Si te equivocas, se usa «Anular movimiento»: se crea el movimiento
  contrario y en el histórico quedan los dos.
- **El recuento nunca cambia el inventario en silencio.** Propone lo que ha pasado y esperas
  tu confirmación.
- **Dos personas trabajando a la vez no pueden dejar el stock en negativo**: las operaciones
  se serializan con bloqueos en la base de datos.

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto nuevo.
2. Copia la **Project URL** y la **anon public key** de *Project Settings → API*.

### 2. Aplicar la base de datos

Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):

```bash
npm install -g supabase
supabase link --project-ref TU_PROJECT_REF
supabase db push          # aplica las migraciones de supabase/migrations
```

O, si prefieres hacerlo a mano, pega en el **SQL Editor** de Supabase el contenido de los
archivos de `supabase/migrations/` **en orden**.

Para probar en local con datos de ejemplo:

```bash
supabase start
supabase db reset         # migraciones + supabase/seed.sql (datos demo)
```

### 3. Crear tu usuario

En Supabase, *Authentication → Users → Add user*, con tu correo y una contraseña.
**El primer usuario que entra se convierte automáticamente en administrador.** Los siguientes
entran como responsables, y desde la pantalla **Usuarios** les asignas sus establecimientos.

### 4. Arrancar la aplicación

```bash
cp .env.example .env.local     # y rellena las dos variables
npm install
npm run dev                    # http://localhost:3000
```

### 5. Publicar en Vercel

1. Sube el repositorio a GitHub e impórtalo en [vercel.com](https://vercel.com).
2. Añade las variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Despliega. No hace falta configurar nada más.

### 6. Instalarla en el móvil

- **iPhone:** abre la web en Safari → *Compartir* → **Añadir a pantalla de inicio**.
- **Android:** abre la web en Chrome → menú → **Instalar aplicación**.

Queda como una aplicación más, a pantalla completa y con su icono.

---

## Datos de demostración

`supabase db reset` deja un escenario completo listo para probar:

| Usuario                | Contraseña     | Permisos                      |
| ---------------------- | -------------- | ----------------------------- |
| `admin@tracata.local`  | `tracata2026`  | Administrador                 |
| `marta@tracata.local`  | `tracata2026`  | Responsable de *La Huerta*    |
| `jose@tracata.local`   | `tracata2026`  | Responsable de *Raspa*        |

Incluye: campaña *Lotería de Navidad 2026*, cinco establecimientos, compra inicial de 100
décimos del **69588**, entregas a los cinco locales, varias ventas, una retirada completa
(*La Huerta*), una retirada parcial que deja 10 € pendientes (*Raspa*), una devolución, un
recuento que detecta 2 ventas y una segunda compra de 50 décimos del **06004**.

> Cambia esas contraseñas antes de usar la aplicación de verdad.

---

## Quién puede hacer qué

| | Administrador | Responsable |
| --- | :---: | :---: |
| Ver todos los establecimientos | ✅ | ❌ (solo los suyos) |
| Registrar ventas y recuentos | ✅ | ✅ (solo en los suyos) |
| Ver su caja de lotería | ✅ | ✅ |
| Comprar lotería / entregar / devolver | ✅ | ❌ |
| Retirar dinero | ✅ | ❌ |
| Ver la caja central | ✅ | ❌ |
| Anular movimientos | ✅ | ❌ |
| Gestionar usuarios y configuración | ✅ | ❌ |

Los permisos **se aplican en la propia base de datos** con Row Level Security, no ocultando
botones: aunque alguien manipulase la interfaz, la base de datos seguiría negándole el acceso.

---

## Tests

```bash
npm test
```

Las pruebas levantan **PostgreSQL de verdad**, aplican las migraciones reales del proyecto y
comprueban, entre otras cosas, que:

- no se pueden entregar más décimos de los que hay, ni vender más de los que tiene un bar;
- vender 10 décimos genera 230 € de facturación, 200 € de capital y 30 € para la fiesta;
- tras retirar esos 230 €, la caja pendiente queda a 0 pero la aportación sigue siendo 30 €;
- una retirada parcial mantiene viva la diferencia;
- una compra nueva no borra el histórico de las anteriores;
- el inventario cuadra siempre;
- **dos usuarios operando a la vez no pueden dejar el stock en negativo**;
- un responsable no ve la caja central ni las cifras de los demás establecimientos;
- conectándose con el mismo rol de base de datos que usa la aplicación en producción,
  nadie puede hacerse pasar por administrador ni escribir en el histórico.

Las pruebas de concurrencia y del seed necesitan un PostgreSQL accesible. Indícalo con
`TEST_DATABASE_URL` (por defecto `postgresql://postgres@localhost:55432/postgres`); si no hay
ninguno disponible, se omiten y el resto de la suite sigue ejecutándose sobre PGlite.

```bash
npm run typecheck   # comprobación de tipos
npm run build       # compilación de producción
```

---

## Tecnología

Next.js (App Router) · TypeScript · Tailwind CSS · componentes al estilo shadcn/ui ·
Supabase (PostgreSQL + Auth + Row Level Security) · PWA instalable · preparada para Vercel.
