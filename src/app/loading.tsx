import { CardSkeleton } from '@/components/shared/TableSkeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 bg-surface border border-border rounded animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-5 space-y-3">
            <div className="h-3 w-24 bg-border/50 rounded animate-pulse" />
            <div className="h-8 w-32 bg-border/40 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <CardSkeleton count={6} />
    </div>
  )
}
