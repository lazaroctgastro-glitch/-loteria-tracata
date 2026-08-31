'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Menu, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { MOBILE_NAV, OPERATIONS, SECTIONS, visibleItems } from '@/lib/navigation'
import { signOutAction } from '@/lib/actions'
import { Button } from '@/components/ui/button'

export function AppShell({
  children,
  isAdmin,
  userName,
  campaignName,
}: {
  children: React.ReactNode
  isAdmin: boolean
  userName: string
  campaignName: string
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const sections = visibleItems(SECTIONS, isAdmin)
  const operations = visibleItems(OPERATIONS, isAdmin)

  React.useEffect(() => setMenuOpen(false), [pathname])

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <div className="min-h-dvh">
      {/* ---------------------------------------------------------- Cabecera */}
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              🎄
            </span>
            <span className="hidden sm:inline">Lotería Tracatá</span>
          </Link>
          <span className="hidden truncate text-sm text-muted-foreground md:inline">{campaignName}</span>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
            <form action={signOutAction}>
              <Button variant="ghost" size="icon" type="submit" aria-label="Cerrar sesión">
                <LogOut />
              </Button>
            </form>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menú"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {menuOpen ? (
          <nav className="border-t bg-card px-4 py-3 lg:hidden">
            <div className="grid gap-1">
              {[...sections, ...operations].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                    isActive(item.href) ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5">
        {/* ------------------------------------------ Menú lateral (escritorio) */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-6">
            <div className="space-y-1">
              {sections.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Operaciones
              </p>
              {operations.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* ------------------------------------- Navegación inferior (móvil) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive(item.href) ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
