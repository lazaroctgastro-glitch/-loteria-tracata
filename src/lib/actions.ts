'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth'
import { parseMoneyToCents } from '@/lib/money'
// El tipo y el estado inicial viven en `action-state.ts`: este archivo lleva
// 'use server' y solo puede exportar funciones async.
import type { ActionState } from '@/lib/action-state'

function fail(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, message, fieldErrors }
}

/**
 * La Row Level Security impide que un responsable modifique lo que no le
 * corresponde, pero un UPDATE bloqueado por RLS simplemente afecta a 0 filas y
 * no da error. Sin esta comprobación la aplicación respondería "guardado"
 * sin haber guardado nada.
 */
async function assertAdmin(): Promise<ActionState | null> {
  const user = await requireUser()
  return user.isAdmin ? null : fail('No tienes permiso para hacer esto.')
}

function done(message: string): ActionState {
  refreshEverything()
  return { ok: true, message }
}

function refreshEverything() {
  // Todas las cifras se derivan del libro mayor: al escribir, se refresca todo.
  revalidatePath('/', 'layout')
}

/** Traduce los errores de PostgreSQL a mensajes claros para el usuario. */
function humanize(error: { message: string; code?: string } | null): string {
  if (!error) return 'No se ha podido completar la operación.'
  const message = error.message.replace(/^.*?ERROR:\s*/i, '').trim()
  if (/permission denied|insufficient_privilege/i.test(message)) {
    return 'No tienes permiso para hacer esto.'
  }
  if (/violates unique constraint|duplicate key/i.test(message)) {
    return 'Ese registro ya existe.'
  }
  return message || 'No se ha podido completar la operación.'
}

const quantity = z.coerce
  .number({ message: 'Indica una cantidad' })
  .int('La cantidad debe ser un número entero de décimos')
  .positive('La cantidad debe ser mayor que 0')

const uuid = z.string().uuid('Selecciona una opción')
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida')
  .optional()

function money(field: string) {
  return z.string().transform((value, ctx) => {
    const cents = parseMoneyToCents(value)
    if (cents === null || cents <= 0) {
      ctx.addIssue({ code: 'custom', message: `Indica un importe válido en ${field}` })
      return z.NEVER
    }
    return cents
  })
}

function parse<T extends z.ZodType>(schema: T, formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const result = schema.safeParse(raw)
  if (result.success) return { data: result.data as z.infer<T>, error: null as null }
  const fieldErrors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    fieldErrors[key] ??= issue.message
  }
  return { data: null, error: fail('Revisa los datos del formulario.', fieldErrors) }
}

// ---------------------------------------------------------------- COMPRAR
const purchaseSchema = z.object({
  campaign_id: uuid,
  number: z.string().regex(/^\d{5}$/, 'El número debe tener 5 cifras'),
  quantity,
  unit_price: z.string().optional(),
  occurred_on: isoDate,
  supplier: z.string().optional(),
  notes: z.string().optional(),
})

export async function purchaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { data, error } = parse(purchaseSchema, formData)
  if (error) return error

  const unitPrice = data.unit_price ? parseMoneyToCents(data.unit_price) : null
  if (data.unit_price && (unitPrice === null || unitPrice <= 0)) {
    return fail('Revisa los datos del formulario.', { unit_price: 'Precio de compra no válido' })
  }

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_create_purchase', {
    p_campaign_id: data.campaign_id,
    p_lines: [
      { number: data.number, quantity: data.quantity, ...(unitPrice ? { unit_price_cents: unitPrice } : {}) },
    ],
    p_occurred_on: data.occurred_on,
    p_supplier: data.supplier || null,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done(`Compra registrada: ${data.quantity} décimos del número ${data.number}.`)
}

// ------------------------------------------------- APORTAR A CAJA CENTRAL
const injectionSchema = z.object({
  campaign_id: uuid,
  amount: money('la aportación'),
  occurred_on: isoDate,
  concept: z.string().optional(),
  notes: z.string().optional(),
})

export async function capitalInjectionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { data, error } = parse(injectionSchema, formData)
  if (error) return error

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_capital_injection', {
    p_campaign_id: data.campaign_id,
    p_amount_cents: data.amount,
    p_occurred_on: data.occurred_on,
    p_concept: data.concept || null,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done('Dinero añadido a la caja central.')
}

// --------------------------------------------------------------- ENTREGAR
const moveSchema = z.object({
  establishment_id: uuid,
  lottery_number_id: uuid,
  quantity,
  occurred_on: isoDate,
  notes: z.string().optional(),
})

export async function deliverAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { data, error } = parse(moveSchema, formData)
  if (error) return error

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_deliver', {
    p_establishment_id: data.establishment_id,
    p_lottery_number_id: data.lottery_number_id,
    p_quantity: data.quantity,
    p_occurred_on: data.occurred_on,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done(`Has entregado ${data.quantity} décimos.`)
}

export async function returnAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { data, error } = parse(moveSchema, formData)
  if (error) return error

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_return', {
    p_establishment_id: data.establishment_id,
    p_lottery_number_id: data.lottery_number_id,
    p_quantity: data.quantity,
    p_occurred_on: data.occurred_on,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done(`Se han devuelto ${data.quantity} décimos al almacén central.`)
}

// ----------------------------------------------------------------- VENDER
export async function saleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { data, error } = parse(moveSchema, formData)
  if (error) return error

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_sale', {
    p_establishment_id: data.establishment_id,
    p_lottery_number_id: data.lottery_number_id,
    p_quantity: data.quantity,
    p_occurred_on: data.occurred_on,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done(`Venta registrada: ${data.quantity} décimos.`)
}

// --------------------------------------------------------------- RECUENTO
const countSchema = z.object({
  establishment_id: uuid,
  campaign_id: uuid,
  lines: z.string(),
  occurred_on: isoDate,
  notes: z.string().optional(),
})

export async function countAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { data, error } = parse(countSchema, formData)
  if (error) return error

  let lines: Array<{ lottery_number_id: string; counted_qty: number }>
  try {
    lines = JSON.parse(data.lines)
  } catch {
    return fail('No se ha podido leer el recuento.')
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return fail('Indica cuántos décimos quedan de al menos un número.')
  }
  if (lines.some((l) => !Number.isInteger(l.counted_qty) || l.counted_qty < 0)) {
    return fail('Las unidades contadas deben ser números enteros y no negativos.')
  }

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_register_count', {
    p_establishment_id: data.establishment_id,
    p_campaign_id: data.campaign_id,
    p_lines: lines,
    p_occurred_on: data.occurred_on,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done('Recuento registrado.')
}

// ---------------------------------------------------------------- RETIRAR
const withdrawSchema = z.object({
  establishment_id: uuid,
  campaign_id: uuid,
  amount: money('la retirada'),
  occurred_on: isoDate,
  notes: z.string().optional(),
})

export async function withdrawAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { data, error } = parse(withdrawSchema, formData)
  if (error) return error

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_withdraw', {
    p_establishment_id: data.establishment_id,
    p_campaign_id: data.campaign_id,
    p_amount_cents: data.amount,
    p_occurred_on: data.occurred_on,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done('Retirada registrada.')
}

// ------------------------------------------------------------ FONDO FIESTA
const expenseSchema = z.object({
  campaign_id: uuid,
  concept: z.string().min(2, 'Indica un concepto'),
  amount: money('el gasto'),
  occurred_on: isoDate,
  notes: z.string().optional(),
})

export async function fundExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { data, error } = parse(expenseSchema, formData)
  if (error) return error

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_fund_expense', {
    p_campaign_id: data.campaign_id,
    p_concept: data.concept,
    p_amount_cents: data.amount,
    p_occurred_on: data.occurred_on,
    p_notes: data.notes || null,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done('Gasto registrado en el Fondo Fiesta.')
}

// ----------------------------------------------------------------- AJUSTE
const adjustSchema = z.object({
  lottery_number_id: uuid,
  establishment_id: z.string().optional(),
  delta_qty: z.coerce.number().int('Indica un número entero'),
  reason: z.string().min(2, 'Indica el motivo del ajuste'),
  occurred_on: isoDate,
})

export async function adjustStockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { data, error } = parse(adjustSchema, formData)
  if (error) return error
  if (data.delta_qty === 0) return fail('El ajuste debe ser distinto de 0.')

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('api_adjust_stock', {
    p_lottery_number_id: data.lottery_number_id,
    p_establishment_id: data.establishment_id || null,
    p_delta_qty: data.delta_qty,
    p_reason: data.reason,
    p_occurred_on: data.occurred_on,
  })
  if (rpcError) return fail(humanize(rpcError))
  return done('Ajuste registrado en el histórico.')
}

// ------------------------------------------------------------------ ANULAR
export async function voidMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('movement_id') ?? '')
  const reason = String(formData.get('reason') ?? '')
  if (!id) return fail('Movimiento no válido.')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('api_void_movement', {
    p_movement_id: id,
    p_reason: reason || null,
  })
  if (error) return fail(humanize(error))
  const count = Number(data ?? 1)
  return done(
    count > 1
      ? `Anulados ${count} movimientos de la operación.`
      : 'Movimiento anulado. El original se conserva en el histórico.',
  )
}

// --------------------------------------------------------- ESTABLECIMIENTOS
const establishmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Indica el nombre del establecimiento'),
  manager_name: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.string().optional(),
  sort_order: z.coerce.number().int().optional(),
})

export async function saveEstablishmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await assertAdmin()
  if (denied) return denied

  const { data, error } = parse(establishmentSchema, formData)
  if (error) return error

  const supabase = await createClient()
  const payload = {
    name: data.name.trim(),
    manager_name: data.manager_name?.trim() || null,
    notes: data.notes?.trim() || null,
    is_active: data.is_active === 'on' || data.is_active === 'true',
    sort_order: data.sort_order ?? 0,
  }

  const { data: saved, error: dbError } = data.id
    ? await supabase.from('establishments').update(payload).eq('id', data.id).select('id')
    : await supabase.from('establishments').insert(payload).select('id')

  if (dbError) return fail(humanize(dbError))
  if (!saved || saved.length === 0) return fail('No se ha podido guardar el establecimiento.')
  return done(data.id ? 'Establecimiento actualizado.' : 'Establecimiento creado.')
}

export async function deleteEstablishmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await assertAdmin()
  if (denied) return denied

  const id = String(formData.get('id') ?? '')
  if (!id) return fail('Establecimiento no válido.')

  const supabase = await createClient()
  const { data: deleted, error } = await supabase
    .from('establishments')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) {
    if (/movimientos registrados/i.test(error.message)) {
      return fail(
        'No se puede eliminar: este establecimiento tiene movimientos. Archívalo para dejar de usarlo sin perder el histórico.',
      )
    }
    return fail(humanize(error))
  }
  if (!deleted || deleted.length === 0) return fail('No se ha podido eliminar el establecimiento.')
  return done('Establecimiento eliminado.')
}

// ------------------------------------------------------------------ CAMPAÑA
const campaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Indica el nombre de la campaña'),
  year: z.coerce.number().int().min(2000).max(2100),
  purchase_price: money('el precio de compra'),
  sale_price: money('el precio de venta'),
  is_default: z.string().optional(),
})

export async function saveCampaignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { data, error } = parse(campaignSchema, formData)
  if (error) return error

  if (data.sale_price < data.purchase_price) {
    return fail('Revisa los precios.', {
      sale_price: 'El precio de venta no puede ser menor que el de compra',
    })
  }

  const supabase = await createClient()
  // Todo en una sola transacción: marcar la campaña como activa y guardarla no
  // pueden quedar a medias, o el sistema se quedaría sin campaña en uso.
  const { error: dbError } = await supabase.rpc('api_save_campaign', {
    p_id: data.id || null,
    p_name: data.name.trim(),
    p_year: data.year,
    p_purchase_price_cents: data.purchase_price,
    p_sale_price_cents: data.sale_price,
    // Una campaña nueva pasa siempre a ser la que se está usando.
    p_is_default: !data.id || data.is_default === 'on' || data.is_default === 'true',
  })

  if (dbError) return fail(humanize(dbError))
  return done(data.id ? 'Campaña actualizada.' : 'Campaña creada.')
}

// ------------------------------------------------------------------ USUARIOS
export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('user_id') ?? '')
  const role = String(formData.get('role') ?? '')
  const isActive = formData.get('is_active') === 'on'
  const establishmentIds = formData.getAll('establishment_ids').map(String)

  if (!id || (role !== 'admin' && role !== 'manager')) return fail('Datos de usuario no válidos.')

  const supabase = await createClient()
  // Rol, acceso y establecimientos se cambian en la misma transacción: si algo
  // falla, el responsable no puede quedarse sin ningún bar asignado.
  const { error } = await supabase.rpc('api_set_user_access', {
    p_user_id: id,
    p_role: role,
    p_is_active: isActive,
    p_establishment_ids: [...new Set(establishmentIds)],
  })
  if (error) return fail(humanize(error))

  return done('Usuario actualizado.')
}

// --------------------------------------------------------------------- AUTH
export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
}
