import { formatDate, formatDateTime, formatUserLabel, timeAgo } from '@/lib/format-datetime'

export type AttributionUser = {
  fullName: string
  username?: string | null
}

type Props = {
  at: string | Date | unknown
  user?: AttributionUser | null
  mode?: 'datetime' | 'date' | 'relative'
  showUsername?: boolean
  showUser?: boolean
  className?: string
  inline?: boolean
}

export default function RecordAttribution({
  at,
  user,
  mode = 'datetime',
  showUsername = true,
  showUser = true,
  className = '',
  inline = false,
}: Props) {
  const when =
    mode === 'relative' ? timeAgo(at) : mode === 'date' ? formatDate(at) : formatDateTime(at)
  const who = showUser ? formatUserLabel(user, showUsername) : null

  if (inline) {
    return (
      <span className={`text-xs text-textSecondary ${className}`.trim()}>
        <span className="tabular-nums">{when}</span>
        {who && who !== '—' && (
          <>
            <span className="mx-1">·</span>
            <span className="text-textPrimary">{who}</span>
          </>
        )}
      </span>
    )
  }

  return (
    <div className={`text-xs text-textSecondary ${className}`.trim()}>
      <div className="tabular-nums whitespace-nowrap">{when}</div>
      {showUser && (
        <div className="text-textPrimary truncate" title={who ?? undefined}>
          {who}
        </div>
      )}
    </div>
  )
}
