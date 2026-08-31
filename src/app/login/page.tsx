import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>
}) {
  const params = await searchParams
  const errors: Record<string, string> = {
    perfil: 'Tu usuario no tiene perfil en la aplicación. Pide al administrador que te dé de alta.',
    inactivo: 'Tu usuario está desactivado. Habla con el administrador.',
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-background to-secondary p-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-primary text-3xl shadow-lg">
            🎄
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Lotería Tracatá</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestión de la Lotería de Navidad de tus establecimientos
          </p>
        </div>

        {params.error && errors[params.error] ? (
          <p className="rounded-lg bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
            {errors[params.error]}
          </p>
        ) : null}

        <LoginForm redirectTo={params.redirect ?? '/'} />
      </div>
    </main>
  )
}
