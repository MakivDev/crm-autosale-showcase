'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Send, Pencil, Trash2, Check, X } from 'lucide-react'
import { addComment, updateComment, deleteComment } from '@/actions/comments'

export type CommentItem = {
  id: number
  text: string
  createdAt: string
  updatedAt: string
  userId: number
  User: { id: number; fullName: string; username: string }
}

type Props = {
  comments: CommentItem[]
  entityType: 'vehicle' | 'transaction'
  entityId: number
  currentUserId: number
  isReadOnly?: boolean
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'щойно'
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} д тому`
  return new Date(iso).toLocaleDateString('uk-UA')
}

function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

const AVATAR_COLORS = [
  'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'bg-blue-500/20 text-blue-400 border-blue-500/30',
]

function avatarColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length]
}

function AutoResizeTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={1}
      className={className}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  )
}

function CommentRow({
  comment,
  isOwn,
  onUpdate,
  onDelete,
  isPending,
}: {
  comment: CommentItem
  isOwn: boolean
  onUpdate: (id: number, text: string) => void
  onDelete: (id: number) => void
  isPending: boolean
}) {
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState(comment.text)
  const isEdited = comment.updatedAt !== comment.createdAt

  const handleSave = () => {
    if (editText.trim() && editText.trim() !== comment.text) {
      onUpdate(comment.id, editText)
    }
    setEditMode(false)
  }

  const handleCancel = () => {
    setEditText(comment.text)
    setEditMode(false)
  }

  return (
    <div className="flex gap-3 group">
      <div
        className={`w-7 h-7 rounded border text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${avatarColor(comment.userId)}`}
      >
        {initials(comment.User.fullName)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-textPrimary">
            {comment.User.fullName}
          </span>
          <span className="text-[10px] text-textSecondary">
            {timeAgo(comment.createdAt)}
          </span>
          {isEdited && (
            <span className="text-[10px] text-textSecondary/50 italic">
              (ред.)
            </span>
          )}
        </div>

        {editMode ? (
          <div className="space-y-2">
            <AutoResizeTextarea
              value={editText}
              onChange={setEditText}
              placeholder="Редагувати коментар..."
              className="w-full bg-background border border-accent/40 rounded px-3 py-2 text-sm text-textPrimary focus:outline-none focus:border-accent"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave()
                if (e.key === 'Escape') handleCancel()
              }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={isPending || !editText.trim()}
                className="flex items-center gap-1 text-xs text-accent border border-accent/30 hover:border-accent/60 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              >
                <Check size={11} /> Зберегти
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 text-xs text-textSecondary hover:text-textPrimary px-2 py-1 rounded transition-colors"
              >
                <X size={11} /> Скасувати
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-textSecondary whitespace-pre-wrap break-words leading-relaxed">
            {comment.text}
          </p>
        )}
      </div>

      {isOwn && !editMode && (
        <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0">
          <button
            onClick={() => { setEditText(comment.text); setEditMode(true) }}
            className="p-1 text-textSecondary hover:text-accent transition-colors"
            title="Редагувати"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => onDelete(comment.id)}
            disabled={isPending}
            className="p-1 text-textSecondary hover:text-red-400 transition-colors disabled:opacity-50"
            title="Видалити"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function CommentsSection({
  comments: initialComments,
  entityType,
  entityId,
  currentUserId,
  isReadOnly = false,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [newText, setNewText] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const entityRef =
    entityType === 'vehicle'
      ? { vehicleId: entityId }
      : { transactionId: entityId }

  const handleAdd = () => {
    const text = newText.trim()
    if (!text) return
    setError('')
    startTransition(async () => {
      const res = await addComment({ ...entityRef, text })
      if (res.success) {
        setNewText('')
        router.refresh()
      } else {
        setError(res.error ?? 'Помилка')
      }
    })
  }

  const handleUpdate = (id: number, text: string) => {
    startTransition(async () => {
      await updateComment(id, text)
      router.refresh()
    })
  }

  const handleDelete = (id: number) => {
    startTransition(async () => {
      await deleteComment(id)
      router.refresh()
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-textSecondary" />
        <h2 className="text-sm font-semibold text-textSecondary uppercase tracking-wider">
          Коментарі
        </h2>
        {initialComments.length > 0 && (
          <span className="text-textSecondary/50 text-xs font-normal normal-case tracking-normal">
            ({initialComments.length})
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {initialComments.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-textSecondary">
            Коментарів поки немає
          </div>
        )}

        {initialComments.map(comment => (
          <div key={comment.id} className="px-5 py-4">
            <CommentRow
              comment={comment}
              isOwn={comment.userId === currentUserId}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              isPending={isPending}
            />
          </div>
        ))}
      </div>

      {!isReadOnly && (
        <div className="px-5 py-4 border-t border-border bg-background/30">
          <div className="flex gap-3">
            <div
              className={`w-7 h-7 rounded border text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5 ${avatarColor(currentUserId)}`}
            >
              ✎
            </div>
            <div className="flex-1 space-y-2">
              <AutoResizeTextarea
                value={newText}
                onChange={setNewText}
                onKeyDown={handleKeyDown}
                placeholder="Написати коментар... (Ctrl+Enter для відправки)"
                className="w-full bg-background border border-border text-textPrimary text-sm rounded px-3 py-2 focus:outline-none focus:border-accent transition-colors placeholder:text-textSecondary/50"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              {newText.trim() && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={isPending}
                    className="flex items-center gap-1.5 text-xs bg-accent text-background px-3 py-1.5 rounded font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    <Send size={11} />
                    {isPending ? 'Відправка...' : 'Надіслати'}
                  </button>
                  <button
                    onClick={() => setNewText('')}
                    className="text-xs text-textSecondary hover:text-textPrimary transition-colors px-2 py-1.5"
                  >
                    Скасувати
                  </button>
                  <span className="text-[10px] text-textSecondary/40 ml-auto">
                    Ctrl+Enter
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
