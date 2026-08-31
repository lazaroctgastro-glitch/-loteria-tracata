import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'

/** Archivos que la PWA necesita servir siempre, incluso sin sesión. */
const APP_ASSETS = ['/manifest.webmanifest', '/sw.js', '/offline', '/icons']

/** Rutas accesibles sin haber iniciado sesión. */
const PUBLIC_PATHS = ['/login', '/configurar']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  if (APP_ASSETS.some((path) => pathname.startsWith(path))) return response

  if (!isSupabaseConfigured) {
    if (pathname === '/configurar') return response
    return NextResponse.redirect(new URL('/configurar', request.url))
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Importante: refresca la sesión en cada petición.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}
