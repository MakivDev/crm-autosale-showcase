import TableSkeleton from '@/components/shared/TableSkeleton'

export default function FinanceLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-28 bg-surface border border-border rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-36 bg-surface border border-border rounded animate-pulse" />
          <div className="h-9 w-36 bg-accent/10 border border-accent/30 rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg p-5 space-y-2">
            <div className="h-3 w-24 bg-border/40 rounded animate-pulse" />
            <div className="h-8 w-32 bg-border/30 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={12} cols={6} />
    </div>
  )
}
