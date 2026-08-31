'use client'

import { useEffect } from 'react'

/** Registra el service worker que hace instalable la aplicación. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la aplicación sigue funcionando con conexión.
    })
  }, [])
  return null
}
