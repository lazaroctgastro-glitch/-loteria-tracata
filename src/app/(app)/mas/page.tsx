import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { PageHeader } from '@/components/stat'
import { Card, CardContent } from '@/components/ui/card'
import { OPERATIONS, SECTIONS, visibleItems } from '@/lib/navigation'

export const metadata = { title: 'Más opciones' }

/** Pantalla del botón «Más» de la navegación inferior en móvil. */
export default async function MorePage() {
  const user = await requireUser()
  const sections = visibleItems(SECTIONS, user.isAdmin).filter((item) => item.href !== '/')
  const operations = visibleItems(OPERATIONS, user.isAdmin)

  return (
    <div className="space-y-6">
      <PageHeader title="Todo" description="El resto de secciones y operaciones." />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operaciones
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {operations.map((item) => (
            <NavCard key={item.href} href={item.href} label={item.label} icon={<item.icon className="size-5" />} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Secciones
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {sections.map((item) => (
            <NavCard key={item.href} href={item.href} label={item.label} icon={<item.icon className="size-5" />} />
          ))}
        </div>
      </section>
    </div>
  )
}

function NavCard({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-lg bg-secondary text-muted-foreground">
            {icon}
          </span>
          <span className="font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  )
}
