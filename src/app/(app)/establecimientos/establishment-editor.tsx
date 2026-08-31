'use client'

import * as React from 'react'
import { Pencil, Plus } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { deleteEstablishmentAction, saveEstablishmentAction } from '@/lib/actions'
import type { Establishment } from '@/lib/database.types'

export function EstablishmentEditor({
  mode,
  establishment,
  canDelete,
}: {
  mode: 'create' | 'edit'
  establishment?: Establishment
  canDelete?: boolean
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button>
            <Plus /> Nuevo establecimiento
          </Button>
        ) : (
          <Button variant="outline" size="sm" aria-label="Editar">
            <Pencil />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nuevo establecimiento' : establishment?.name}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Añade un bar o restaurante donde vayas a vender lotería.'
              : 'Cambia los datos de este establecimiento.'}
          </DialogDescription>
        </DialogHeader>

        <ActionForm
          action={saveEstablishmentAction}
          resetOnSuccess={mode === 'create'}
          onSuccess={() => setOpen(false)}
        >
          {(state) => (
            <>
              {establishment ? <input type="hidden" name="id" value={establishment.id} /> : null}
              <Field label="Nombre" htmlFor="name" error={state.fieldErrors?.name}>
                <Input
                  id="name"
                  name="name"
                  defaultValue={establishment?.name}
                  placeholder="La Huerta"
                  required
                />
              </Field>
              <Field label="Responsable" htmlFor="manager_name">
                <Input
                  id="manager_name"
                  name="manager_name"
                  defaultValue={establishment?.manager_name ?? ''}
                  placeholder="Opcional"
                />
              </Field>
              <Field label="Observaciones" htmlFor="notes">
                <Textarea id="notes" name="notes" defaultValue={establishment?.notes ?? ''} rows={2} />
              </Field>
              <Field label="Orden en las listas" htmlFor="sort_order">
                <Input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  defaultValue={establishment?.sort_order ?? 0}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={establishment?.is_active ?? true}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                Activo (aparece al vender y al entregar lotería)
              </label>
              <SubmitButton className="w-full">Guardar</SubmitButton>
            </>
          )}
        </ActionForm>

        {mode === 'edit' && establishment ? (
          <div className="border-t pt-4">
            {canDelete ? (
              <ActionForm action={deleteEstablishmentAction} onSuccess={() => setOpen(false)}>
                <input type="hidden" name="id" value={establishment.id} />
                <SubmitButton variant="ghost" className="w-full text-destructive">
                  Eliminar establecimiento
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-xs text-muted-foreground">
                Este establecimiento tiene movimientos, así que no se puede eliminar. Desmarca
                «Activo» para dejar de usarlo sin perder el histórico.
              </p>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
