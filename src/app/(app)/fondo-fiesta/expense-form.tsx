'use client'

import { PartyPopper } from 'lucide-react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fundExpenseAction } from '@/lib/actions'
import { todayISO } from '@/lib/money'

export function ExpenseForm({ campaignId }: { campaignId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Apuntar un gasto de la fiesta</CardTitle>
        <CardDescription>Se descontará del saldo del Fondo Fiesta.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={fundExpenseAction}>
          {(state) => (
            <>
              <input type="hidden" name="campaign_id" value={campaignId} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Concepto" htmlFor="concept" error={state.fieldErrors?.concept}>
                  <Input
                    id="concept"
                    name="concept"
                    placeholder="Cena de Navidad del personal"
                    required
                  />
                </Field>
                <Field label="Importe" htmlFor="amount" error={state.fieldErrors?.amount}>
                  <Input id="amount" name="amount" inputMode="decimal" placeholder="0,00" required />
                </Field>
                <Field label="Fecha" htmlFor="occurred_on">
                  <Input id="occurred_on" name="occurred_on" type="date" defaultValue={todayISO()} />
                </Field>
              </div>
              <SubmitButton className="w-full sm:w-auto">
                <PartyPopper /> Registrar gasto
              </SubmitButton>
            </>
          )}
        </ActionForm>
      </CardContent>
    </Card>
  )
}
