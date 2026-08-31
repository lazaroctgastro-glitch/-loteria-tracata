'use client'

import * as React from 'react'
import { ActionForm, Field, SubmitButton } from '@/components/action-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { updateUserAction } from '@/lib/actions'
import type { Establishment, Profile } from '@/lib/database.types'

export function UserEditor({
  profile,
  establishments,
  assignedIds,
  isSelf,
}: {
  profile: Profile
  establishments: Establishment[]
  assignedIds: string[]
  isSelf: boolean
}) {
  const [role, setRole] = React.useState(profile.role)

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{profile.full_name ?? profile.email}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          </div>
          <Badge variant={profile.role === 'admin' ? 'default' : 'secondary'}>
            {profile.role === 'admin' ? 'Administrador' : 'Responsable'}
          </Badge>
        </div>

        {isSelf ? (
          <p className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground">
            Esta es tu cuenta. Para evitar quedarte sin acceso, no puedes cambiarte el rol a ti
            mismo.
          </p>
        ) : (
          <ActionForm action={updateUserAction} resetOnSuccess={false}>
            <input type="hidden" name="user_id" value={profile.id} />

            <Field label="Qué puede hacer" htmlFor={`role-${profile.id}`}>
              <Select
                id={`role-${profile.id}`}
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value as Profile['role'])}
              >
                <option value="manager">Responsable de establecimiento</option>
                <option value="admin">Administrador (lo ve y hace todo)</option>
              </Select>
            </Field>

            {role === 'manager' ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Establecimientos que puede ver</legend>
                {establishments.map((establishment) => (
                  <label key={establishment.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="establishment_ids"
                      value={establishment.id}
                      defaultChecked={assignedIds.includes(establishment.id)}
                      className="size-4 accent-[hsl(var(--primary))]"
                    />
                    {establishment.name}
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  Solo verá estos establecimientos. No podrá ver la caja central ni las cifras de los
                  demás.
                </p>
              </fieldset>
            ) : null}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={profile.is_active}
                className="size-4 accent-[hsl(var(--primary))]"
              />
              Puede entrar en la aplicación
            </label>

            <SubmitButton className="w-full">Guardar</SubmitButton>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  )
}
