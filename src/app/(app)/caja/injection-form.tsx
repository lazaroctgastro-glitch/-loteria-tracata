'use client'

import { PiggyBank } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { capitalInjectionAction } from '@/lib/actions'
import { todayISO } from '@/lib/money'

export function InjectionForm({ campaignId }: { campaignId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Añadir dinero a la caja central</CardTitle>
        <CardDescription>
          Para cuando pones dinero de tu bolsillo para comprar la primera lotería.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={capitalInjectionAction}>
          {(state) => (
            <>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Importe" htmlFor="amount" error={state.fieldErrors?.amount}>
                  <Input id="amount" name="amount" inputMode="decimal" placeholder="0,00" required />
                </Field>
                <Field label="Concepto" htmlFor="concept">
                  <Input id="concept" name="concept" placeholder="Aportación inicial" />
                </Field>
                <Field label="Fecha" htmlFor="occurred_on">
                  <Input id="occurred_on" name="occurred_on" type="date" defaultValue={todayISO()} />
                </Field>
              </div>
              <SubmitButton className="w-full sm:w-auto">
                <PiggyBank /> Añadir a la caja
              </SubmitButton>
            </>
          )}
        </ActionForm>
      </CardContent>
    </Card>
  )
}
