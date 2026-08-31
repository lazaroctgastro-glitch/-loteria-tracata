import { AppShell } from '@/components/app-shell'
import { requireUser } from '@/lib/auth'
import { getActiveCampaign } from '@/lib/data'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const campaign = await getActiveCampaign()

  return (
    <AppShell
      isAdmin={user.isAdmin}
      userName={user.profile.full_name ?? user.email}
      campaignName={campaign?.name ?? 'Sin campaña'}
    >
      {children}
    </AppShell>
  )
}
