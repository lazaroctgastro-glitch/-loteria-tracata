# Puesta en marcha, paso a paso

Guía para hacerlo **desde el navegador, sin instalar nada** en el ordenador.

Necesitarás una hora tranquila la primera vez. Todo lo que se usa aquí es
gratuito para un negocio de este tamaño.

> Las pantallas de Supabase y Vercel cambian de aspecto de vez en cuando. Si
> algún botón no se llama exactamente igual, busca el que diga algo parecido:
> el orden de los pasos sigue siendo el mismo.

---

## Antes de empezar

Vas a usar tres sitios web:

| Sitio | Para qué sirve | Cuenta |
| ----- | -------------- | ------ |
| **GitHub** | Guarda el código de la aplicación | Ya la tienes |
| **Supabase** | Guarda tus datos (los décimos, las ventas, el dinero) | La creas en el paso 2 |
| **Vercel** | Publica la aplicación en internet | La creas en el paso 5 |

Ten a mano un sitio donde apuntar contraseñas y claves.

---

## Paso 1 · Pasar el código a la rama principal

El código está en una rama aparte y hay que unirlo a la principal para poder
publicarlo.

1. Entra en tu repositorio en **github.com**.
2. Verás un aviso amarillo con el nombre de la rama y un botón
   **«Compare & pull request»**. Púlsalo.
   (Si no aparece: pestaña **Pull requests** → **New pull request**, y elige la
   rama `claude/lottery-sales-pwa-app-vaypsr`.)
3. Pulsa **«Create pull request»**.
4. Después pulsa **«Merge pull request»** y confirma con **«Confirm merge»**.

Ya está el código en la rama principal.

---

## Paso 2 · Crear la base de datos

1. Entra en **supabase.com** y pulsa **«Start your project»**. Puedes entrar con
   tu cuenta de GitHub.
2. Pulsa **«New project»**.
3. Rellena:
   - **Name**: `loteria` (o lo que quieras).
   - **Database Password**: pulsa «Generate a password» y **guárdala**. No la
     necesitarás para el día a día, pero no se puede recuperar.
   - **Region**: elige **Europe (Frankfurt)** o la más cercana a España.
4. Pulsa **«Create new project»** y espera un par de minutos a que termine.

---

## Paso 3 · Crear las tablas

1. Abre el archivo **`supabase/instalacion-completa.sql`** de tu repositorio en
   GitHub y pulsa el botón de **copiar** (el icono de dos hojas, arriba a la
   derecha del archivo).
2. En Supabase, menú de la izquierda → **SQL Editor** → **«New query»**.
3. Pega todo en el recuadro grande.
4. Pulsa **«Run»** (o `Ctrl`+`Intro`).

Debe aparecer un mensaje verde de éxito. Si sale algo en rojo, no sigas: cópialo
y pregúntame.

> Este paso se puede repetir sin miedo: ejecutarlo dos veces no rompe nada.

---

## Paso 4 · Crear tu usuario

1. En Supabase, menú de la izquierda → **Authentication** → **Users**.
2. Pulsa **«Add user»** → **«Create new user»**.
3. Escribe tu correo y una contraseña (apúntala).
4. **Marca la casilla «Auto Confirm User»**. Si no, no podrás entrar.
5. Pulsa **«Create user»**.

**El primer usuario que entre en la aplicación se convierte automáticamente en
administrador.** Que sea el tuyo.

Al resto del personal los darás de alta más adelante, en el paso 8.

---

## Paso 5 · Copiar las dos claves

1. En Supabase, abajo del menú → **Project Settings** → **API**.
2. Apunta dos cosas:
   - **Project URL**: algo como `https://abcdefghij.supabase.co`
   - **La clave pública**: aparece como **`anon` `public`**, o como
     **«Publishable key»** en los proyectos más nuevos. Es un texto muy largo.

> Hay otra clave marcada como **secret** o **service_role**. **Esa no se usa
> aquí y no debe salir nunca de Supabase.** Si la pegas en algún sitio, cualquiera
> podría entrar en tus datos.

---

## Paso 6 · Publicar la aplicación

1. Entra en **vercel.com** y regístrate **con tu cuenta de GitHub**.
2. Pulsa **«Add New…»** → **«Project»**.
3. Busca tu repositorio en la lista y pulsa **«Import»**.
4. Antes de desplegar, abre **«Environment Variables»** y añade las dos claves
   del paso anterior:

   | Name | Value |
   | ---- | ----- |
   | `NEXT_PUBLIC_SUPABASE_URL` | la Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clave pública |

   Escribe los nombres **exactamente así**, en mayúsculas y con guiones bajos.
5. Pulsa **«Deploy»** y espera uno o dos minutos.

Al terminar te dará una dirección tipo `https://loteria-xxxx.vercel.app`.
**Esa es tu aplicación.**

---

## Paso 7 · Primera entrada y comprobación

Abre esa dirección y entra con el correo y la contraseña del paso 4.

Antes de meter datos de verdad, haz esta comprobación de cinco minutos:

1. **Configuración** → **«Nueva campaña»**: nombre `Lotería de Navidad 2026`,
   año 2026, precio de compra `20`, precio de venta `23`. Guardar.
2. **Establecimientos** → **«Nuevo establecimiento»**: crea uno de prueba.
3. **Comprar lotería**: número `69588`, 10 décimos. Guardar.
4. **Entregar lotería**: 5 décimos a ese establecimiento.
5. **Registrar venta**: 2 décimos.
6. Vuelve a **Inicio**. La tarjeta debe decir:
   **CAJA PENDIENTE DE RECOGER: 46,00 €** (2 × 23 €).
7. **Retirar dinero** → «Retirar todo». La caja debe quedar en **0,00 €**, y el
   Fondo Fiesta en **6,00 €** (2 × 3 €).

Si esos números salen, funciona todo.

> **¿Y si quiero borrar esta prueba?** Los movimientos no se pueden borrar
> nunca: es lo que garantiza que las cuentas sean fiables. Si prefieres empezar
> completamente limpio, repite el paso 3 poniendo antes esta línea al principio
> del recuadro:
> `drop schema public cascade; create schema public;`
> Eso **borra todos los datos** y vuelve a crear las tablas vacías. Úsalo solo
> ahora, al principio, nunca con datos reales dentro.

---

## Paso 8 · Dar de alta a tu gente

Para cada responsable de bar:

1. En **Supabase** → **Authentication** → **Users** → **«Add user»**, con su
   correo y una contraseña. Marca **«Auto Confirm User»**.
2. Dile que entre una vez en la aplicación con esos datos.
3. Entra tú en **Usuarios** dentro de la aplicación: ya aparecerá. Marca **qué
   establecimientos** puede ver y guarda.

A partir de ahí, esa persona **solo verá su bar**: podrá registrar ventas y
hacer recuentos, pero no verá la caja central, ni las cifras de los demás
locales, ni podrá comprar lotería ni retirar dinero.

---

## Paso 9 · Instalarla en el móvil

- **iPhone**: abre la dirección en **Safari** (no vale Chrome) → botón
  **Compartir** → **«Añadir a pantalla de inicio»**.
- **Android**: abre la dirección en **Chrome** → menú de los tres puntos →
  **«Instalar aplicación»**.

Queda con su icono, como una aplicación más.

Haz esto en el móvil de cada responsable.

---

## Dudas frecuentes

**¿Cuánto cuesta?**
Para cinco bares, el plan gratuito de Supabase y el de Vercel van sobrados.

**¿Se pierden los datos?**
Los datos viven en Supabase, no en el móvil. Aunque cambies de teléfono, siguen
ahí. Supabase hace copias de seguridad automáticas.

**Me he equivocado en una venta.**
Ve a **Movimientos**, busca el apunte y pulsa **«Anular»**. No se borra: se
apunta la corrección al lado, para que siempre se vea qué pasó.

**¿Y si alguien apunta mal las ventas?**
Usa **Recuento**: cuentas los décimos que quedan de verdad y la aplicación te
dice cuántos se han vendido y cuánto dinero debería haber. No cambia nada sin que
tú lo confirmes.

**¿Puedo cambiar los precios el año que viene?**
Sí, en **Configuración**, creando una campaña nueva. El histórico del año
anterior no se toca.
