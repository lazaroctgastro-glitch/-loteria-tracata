'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { IDLE, type ActionState } from '@/lib/action-state'

type ActionFormProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  children: React.ReactNode | ((state: ActionState) => React.ReactNode)
  className?: string
  /** Vacía el formulario cuando la operación se completa correctamente. */
  resetOnSuccess?: boolean
  onSuccess?: () => void
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  onSuccess,
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, IDLE)
  const formRef = React.useRef<HTMLFormElement>(null)
  const handledRef = React.useRef<ActionState | null>(null)
  const onSuccessRef = React.useRef(onSuccess)
  onSuccessRef.current = onSuccess

  // Cada resultado se procesa una sola vez, aunque el componente se vuelva a
  // renderizar mientras el usuario sigue escribiendo.
  React.useEffect(() => {
    if (!state.ok || handledRef.current === state) return
    handledRef.current = state
    if (resetOnSuccess) formRef.current?.reset()
    onSuccessRef.current?.()
  }, [state, resetOnSuccess])

  return (
    <form ref={formRef} action={formAction} className={cn('space-y-4', className)}>
      {typeof children === 'function' ? children(state) : children}
      <FormMessage state={state} />
    </form>
  )
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg p-3 text-sm font-medium',
        state.ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
      )}
    >
      {state.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      ) : (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{state.message}</span>
    </div>
  )
}

export function SubmitButton({ children, disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" {...props} disabled={pending || disabled}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  )
}
