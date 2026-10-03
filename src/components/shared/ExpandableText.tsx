'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function ExpandableText({
  text,
  maxChars = 90,
  maxLines,
  className = '',
  emptyPlaceholder,
}: {
  text: string | null | undefined
  maxChars?: number
  maxLines?: number
  className?: string
  emptyPlaceholder?: string
}) {
  const [expanded, setExpanded] = useState(false)

  if (!text?.trim()) {
    return emptyPlaceholder ? (
      <span className={`text-textSecondary/50 ${className}`}>{emptyPlaceholder}</span>
    ) : null
  }

  const trimmed = text.trim()
  const usesLineClamp = maxLines != null && !expanded
  const needsCharExpand = !maxLines && trimmed.length > maxChars
  const needsExpand = maxLines != null
    ? trimmed.length > 48 || trimmed.includes('\n')
    : needsCharExpand

  const visible = (() => {
    if (expanded) return trimmed
    if (usesLineClamp) return trimmed
    if (needsCharExpand) return `${trimmed.slice(0, maxChars).trimEnd()}…`
    return trimmed
  })()
  const clampClass =
    usesLineClamp
      ? maxLines === 1
        ? 'line-clamp-1'
        : maxLines === 2
          ? 'line-clamp-2'
          : maxLines === 3
            ? 'line-clamp-3'
            : 'line-clamp-2'
      : ''

  return (
    <div className={className}>
      <p
        className={`break-words leading-snug overflow-hidden ${
          expanded ? 'whitespace-pre-wrap' : clampClass
        }`}
      >
        {visible}
      </p>
      {needsExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-accent/70 hover:text-accent transition-colors"
        >
          {expanded ? (
            <>
              Згорнути
              <ChevronUp className="w-3 h-3 shrink-0" />
            </>
          ) : (
            <>
              Ще
              <ChevronDown className="w-3 h-3 shrink-0" />
            </>
          )}
        </button>
      )}
    </div>
  )
}

export function ExpandableLines({
  lines,
  maxChars = 100,
  maxLines,
  className = '',
  emptyPlaceholder = '—',
}: {
  lines: string[]
  maxChars?: number
  maxLines?: number
  className?: string
  emptyPlaceholder?: string
}) {
  const filtered = lines.filter(Boolean)
  if (filtered.length === 0) {
    return <span className={`text-textSecondary/50 ${className}`}>{emptyPlaceholder}</span>
  }
  return (
    <ExpandableText
      text={filtered.join('\n')}
      maxChars={maxChars}
      maxLines={maxLines}
      className={className}
    />
  )
}
