'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/action-form'

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
    })

    if (authError) {
      setError(
        /invalid login credentials/i.test(authError.message)
          ? 'El correo o la contraseña no son correctos.'
          : authError.message,
      )
      setPending(false)
      return
    }

    router.replace(redirectTo)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Correo electrónico" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              placeholder="tu@correo.com"
            />
          </Field>
          <Field label="Contraseña" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </Field>

          {error ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
