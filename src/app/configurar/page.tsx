import { isSupabaseConfigured } from '@/lib/supabase/config'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Configuración inicial' }

export default function SetupPage() {
  if (isSupabaseConfigured) redirect('/')

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">Falta conectar la base de datos</h1>
      <p className="mt-2 text-muted-foreground">
        La aplicación está desplegada pero todavía no sabe dónde están tus datos. Añade estas dos
        variables de entorno y vuelve a desplegar:
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl border bg-card p-4 text-sm">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...`}
      </pre>
      <p className="mt-4 text-sm text-muted-foreground">
        Las encontrarás en tu proyecto de Supabase, en <strong>Project Settings → API</strong>. En el
        archivo <code>README.md</code> tienes el paso a paso completo.
      </p>
    </main>
  )
}
