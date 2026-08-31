import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  Boxes,
  ClipboardCheck,
  FileBarChart,
  Gift,
  Home,
  PartyPopper,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  shortLabel?: string
  icon: LucideIcon
  adminOnly?: boolean
}

export const OPERATIONS: NavItem[] = [
  { href: '/vender', label: 'Registrar venta', shortLabel: 'Vender', icon: Receipt },
  { href: '/recuento', label: 'Recuento de lotería', shortLabel: 'Recuento', icon: ClipboardCheck },
  { href: '/entregar', label: 'Entregar lotería', shortLabel: 'Entregar', icon: Truck, adminOnly: true },
  { href: '/retirar', label: 'Retirar dinero', shortLabel: 'Retirar', icon: Banknote, adminOnly: true },
  { href: '/comprar', label: 'Comprar lotería', shortLabel: 'Comprar', icon: ShoppingCart, adminOnly: true },
]

export const SECTIONS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/establecimientos', label: 'Establecimientos', icon: Store },
  { href: '/inventario', label: 'Inventario', icon: Boxes },
  { href: '/caja', label: 'Caja central', icon: Wallet, adminOnly: true },
  { href: '/fondo-fiesta', label: 'Fondo Fiesta', icon: PartyPopper },
  { href: '/movimientos', label: 'Movimientos', icon: Gift },
  { href: '/informes', label: 'Informes', icon: FileBarChart },
  { href: '/usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
  { href: '/configuracion', label: 'Configuración', icon: Settings, adminOnly: true },
]

/** Accesos de la barra inferior en móvil. */
export const MOBILE_NAV: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/vender', label: 'Vender', icon: Receipt },
  { href: '/recuento', label: 'Recuento', icon: ClipboardCheck },
  { href: '/movimientos', label: 'Historial', icon: Gift },
  { href: '/mas', label: 'Más', icon: Boxes },
]

export function visibleItems(items: NavItem[], isAdmin: boolean): NavItem[] {
  return items.filter((item) => !item.adminOnly || isAdmin)
}
