export default function UsersLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-surface border border-border rounded animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 min-h-[480px]">
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
          <div className="h-9 w-full bg-border/40 rounded animate-pulse" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-border/30 rounded animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div className="h-6 w-40 bg-border/50 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-border/30 rounded animate-pulse" />
            ))}
          </div>
          <div className="h-48 bg-border/20 rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}
