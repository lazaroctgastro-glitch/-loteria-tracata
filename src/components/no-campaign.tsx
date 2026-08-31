import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function NoCampaign({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Todavía no hay ninguna campaña</CardTitle>
        <CardDescription>
          Una campaña agrupa toda la lotería de un año: los números que compras, los precios y todos
          los movimientos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isAdmin ? (
          <Button asChild size="lg" className="w-full">
            <Link href="/configuracion">Crear la campaña de este año</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pide al administrador que cree la campaña de este año.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
