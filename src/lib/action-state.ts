/**
 * Resultado de una acción de formulario.
 *
 * Vive en su propio archivo A PROPÓSITO: `src/lib/actions.ts` lleva la
 * directiva `'use server'`, y un archivo así solo puede exportar funciones
 * `async`. Exportar de ahí una constante como `IDLE` hace que Next.js falle al
 * ejecutar la acción ("A 'use server' file can only export async functions").
 */
export type ActionState = {
  ok: boolean
  message: string
  fieldErrors?: Record<string, string>
}

/** Estado inicial, antes de enviar el formulario por primera vez. */
export const IDLE: ActionState = { ok: false, message: '' }
