import { EmptyState, PageHeader } from '@/components/stat'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAdmin } from '@/lib/auth'
import { getEstablishments, getProfiles, getUserEstablishments } from '@/lib/data'
import { UserEditor } from './user-editor'

export const metadata = { title: 'Usuarios' }

export default async function UsersPage() {
  const admin = await requireAdmin()
  const [profiles, establishments, assignments] = await Promise.all([
    getProfiles(),
    getEstablishments(),
    getUserEstablishments(),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Usuarios"
        description="Quién puede entrar y qué puede ver cada persona."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo dar de alta a alguien</CardTitle>
          <CardDescription>
            Las cuentas se crean desde Supabase (Authentication → Users → Add user), con su correo y
            una contraseña. En cuanto entren por primera vez aparecerán en esta lista como
            responsables y podrás asignarles sus establecimientos.
          </CardDescription>
        </CardHeader>
      </Card>

      {profiles.length === 0 ? (
        <EmptyState title="Todavía no hay usuarios." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {profiles.map((profile) => (
            <UserEditor
              key={profile.id}
              profile={profile}
              establishments={establishments}
              assignedIds={assignments
                .filter((assignment) => assignment.user_id === profile.id)
                .map((assignment) => assignment.establishment_id)}
              isSelf={profile.id === admin.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
