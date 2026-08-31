import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/database.types'

export type SessionUser = {
  id: string
  email: string
  profile: Profile
  isAdmin: boolean
  establishmentIds: string[]
}

/** Usuario autenticado + su perfil y permisos. Redirige al login si no hay sesión. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  if (!profile) {
    // El perfil se crea automáticamente al registrarse; si falta, algo va mal.
    redirect('/login?error=perfil')
  }
  if (!profile.is_active) {
    redirect('/login?error=inactivo')
  }

  const { data: assignments } = await supabase
    .from('user_establishments')
    .select('establishment_id')
    .eq('user_id', user.id)

  return {
    id: user.id,
    email: user.email ?? profile.email,
    profile,
    isAdmin: profile.role === 'admin',
    establishmentIds: (assignments ?? []).map((a) => a.establishment_id),
  }
})

/** Igual que requireUser pero además exige rol de administrador. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!user.isAdmin) redirect('/?error=solo-admin')
  return user
}
