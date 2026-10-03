'use client'

import { canDismissOverlay } from '@/lib/overlay-guard'

export default function OverlayBackdrop({
  onDismiss,
  className = 'fixed inset-0 bg-black/60 z-[300]',
}: {
  onDismiss: () => void
  className?: string
}) {
  return (
    <div
      data-overlay-backdrop
      className={className}
      aria-hidden
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (!canDismissOverlay()) {
          e.stopPropagation()
          return
        }
        onDismiss()
      }}
    />
  )
}
