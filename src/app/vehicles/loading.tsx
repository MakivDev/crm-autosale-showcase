import { CardSkeleton } from '@/components/shared/TableSkeleton'

export default function VehiclesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-surface border border-border rounded animate-pulse" />
        <div className="h-9 w-36 bg-surface border border-border rounded animate-pulse" />
      </div>
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-7 w-20 bg-surface border border-border rounded animate-pulse" />
        ))}
      </div>
      <CardSkeleton count={10} />
    </div>
  )
}
