export default function TableSkeleton({
  rows = 8,
  cols = 5,
  className = '',
}: {
  rows?: number
  cols?: number
  className?: string
}) {
  return (
    <div className={`bg-surface border border-border rounded-lg overflow-hidden ${className}`}>
      <div className="h-10 bg-surfaceHover border-b border-border flex items-center px-4 gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-border/60 animate-pulse" style={{ width: `${60 + (i % 3) * 30}px` }} />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className="h-3 rounded bg-border/40 animate-pulse"
                style={{ width: `${50 + ((i + j) % 4) * 25}px`, animationDelay: `${(i + j) * 50}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="aspect-[4/3] bg-border/30 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-border/40 rounded animate-pulse w-3/4" />
            <div className="h-2.5 bg-border/30 rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
