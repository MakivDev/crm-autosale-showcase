import TableSkeleton from '@/components/shared/TableSkeleton'

export default function NotificationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-44 bg-surface border border-border rounded animate-pulse" />
        <div className="h-9 w-32 bg-surface border border-border rounded animate-pulse" />
      </div>
      <TableSkeleton rows={10} cols={4} />
    </div>
  )
}
