import NotificationsClient from '@/components/notifications/NotificationsClient'
import { getNotifications } from '@/actions/notifications'

export default async function NotificationsPage() {
  const { active, dismissed } = await getNotifications()

  return <NotificationsClient active={active} dismissed={dismissed} />
}
