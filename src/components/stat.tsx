import { cn } from '@/lib/utils'

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted'

const toneStyles: Record<Tone, string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  size = 'md',
  className,
}: {
  label: string
  value: string
  hint?: string
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'tabular mt-1 font-semibold leading-tight',
          size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl',
          toneStyles[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function DataRow({
  label,
  value,
  tone = 'default',
  strong,
}: {
  label: string
  value: string
  tone?: Tone
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('tabular text-sm', strong ? 'font-semibold' : 'font-medium', toneStyles[tone])}>
        {value}
      </span>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}
