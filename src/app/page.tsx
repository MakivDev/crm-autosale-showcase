import { getDashboardStats } from '@/actions/dashboard'
import DashboardClient from '@/components/dashboard/DashboardClient'
import Link from 'next/link'

export default async function DashboardPage() {
  const res = await getDashboardStats()

  if (!res.success || !res.data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-textSecondary text-sm mb-2">Не вдалося завантажити дані дашборду</p>
          <Link href="/settings" className="text-accent text-sm hover:underline">
            Перевірте налаштування →
          </Link>
        </div>
      </div>
    )
  }

  return <DashboardClient data={res.data} />
}
