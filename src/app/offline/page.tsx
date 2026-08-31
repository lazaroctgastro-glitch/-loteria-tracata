export const metadata = { title: 'Sin conexión' }

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-5xl">📶</p>
        <h1 className="text-2xl font-bold">No hay conexión</h1>
        <p className="text-muted-foreground">
          Necesitas conexión a internet para ver las cifras actualizadas. Vuelve a intentarlo cuando
          recuperes la cobertura.
        </p>
      </div>
    </main>
  )
}
