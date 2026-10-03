import TableSkeleton from '@/components/shared/TableSkeleton'

export default function DictionariesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 bg-surface border border-border rounded animate-pulse" />
        <div className="h-4 w-96 max-w-full bg-surface border border-border rounded animate-pulse" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 bg-surface border border-border rounded-md animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TableSkeleton rows={8} cols={2} />
        <TableSkeleton rows={8} cols={2} />
      </div>
    </div>
  )
}
