'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { deleteStoRecord } from '@/actions/sto'
import { toast } from 'sonner'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import RecordAttribution from '@/components/shared/RecordAttribution'

export type StoRecordItem = {
  id: number
  amountUsd: unknown
  registerAmount: unknown
  comment: string | null
  createdAt: string
  RepairType: { id: number; name: string }
  CashRegister: { id: number; name: string; Currency: { code: string } }
  User?: { id: number; fullName: string; username: string }
  Vehicle?: {
    id: number
    vin: string
    Model: { name: string; Make: { name: string } }
  }
}

function recordAuthor(record: StoRecordItem) {
  return record.User ? { fullName: record.User.fullName, username: record.User.username } : null
}

function VehicleCell({ vehicle }: { vehicle: NonNullable<StoRecordItem['Vehicle']> }) {
  return (
    <Link
      href={`/vehicles/${vehicle.id}`}
      className="text-xs hover:text-accent transition-colors group/v"
    >
      <span className="text-textPrimary group-hover/v:text-accent">
        {vehicle.Model.Make.name} {vehicle.Model.name}
      </span>
      <span className="block text-[10px] text-textSecondary font-mono">{vehicle.vin.slice(-6)}</span>
    </Link>
  )
}

type Props = {
  records: StoRecordItem[]
  showVehicle?: boolean
  isReadOnly?: boolean
  canDelete?: boolean
  canAdd?: boolean
  emptyMessage?: string
  onAdd?: () => void
  onEdit?: (record: StoRecordItem) => void
  onDeleted?: () => void
}

function StoRecordMobileCard({
  record: r,
  showVehicle,
  isReadOnly,
  onEdit,
  onDelete,
  deleting,
  canDelete = true,
}: {
  record: StoRecordItem
  showVehicle?: boolean
  isReadOnly?: boolean
  onEdit?: (record: StoRecordItem) => void
  onDelete: (id: number) => void
  deleting: boolean
  canDelete?: boolean
}) {
  return (
    <div className="p-4 border-b border-border last:border-b-0 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
          {r.RepairType.name}
        </span>
        <RecordAttribution at={r.createdAt} user={recordAuthor(r)} className="text-right shrink-0" />
      </div>
      {showVehicle && r.Vehicle && <VehicleCell vehicle={r.Vehicle} />}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 text-xs text-textSecondary">
          <span className="text-textPrimary break-words">{r.CashRegister.name}</span>
          {r.comment && <p className="text-[11px] mt-1 break-words leading-relaxed">{r.comment}</p>}
        </div>
        <div className="text-right shrink-0 font-mono text-xs">
          <span className="text-textPrimary block">${Number(r.amountUsd).toFixed(2)}</span>
          <span className="text-[10px] text-textSecondary">
            {Number(r.registerAmount).toLocaleString()} {r.CashRegister.Currency.code}
          </span>
        </div>
      </div>
      {!isReadOnly && (onEdit || canDelete) && (
        <div className="flex gap-2 pt-0.5">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(r)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-textSecondary hover:text-accent hover:border-accent/30 transition-all"
            >
              <Pencil className="w-3.5 h-3.5" /> Редагувати
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(r.id)}
              disabled={deleting}
              className="flex items-center justify-center px-3 py-2 rounded-lg border border-border text-textSecondary hover:text-red-400 hover:border-red-400/30 transition-all disabled:opacity-50"
              title="Видалити"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function StoRecordTable({
  records,
  showVehicle,
  isReadOnly,
  canDelete = true,
  canAdd = false,
  emptyMessage = 'Записів СТО ще немає',
  onAdd,
  onEdit,
  onDeleted,
}: Props) {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleDelete = (id: number) => {
    if (!confirm('Видалити запис СТО? Кошти будуть повернені на касу.')) return
    setDeletingId(id)
    startTransition(async () => {
      const res = await deleteStoRecord(id)
      if (res.success) {
        toast.success('Запис видалено')
        notifyCrmRefresh()
        onDeleted?.()
      } else {
        toast.error(res.error ?? 'Помилка')
      }
      setDeletingId(null)
    })
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 px-4 space-y-3">
        <p className="text-sm text-textSecondary">{emptyMessage}</p>
        {canAdd && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-background rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Додати роботу
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="md:hidden divide-y divide-border">
        {records.map((r) => (
          <StoRecordMobileCard
            key={r.id}
            record={r}
            showVehicle={showVehicle}
            isReadOnly={isReadOnly}
            onEdit={onEdit}
            onDelete={handleDelete}
            deleting={isPending && deletingId === r.id}
            canDelete={canDelete}
          />
        ))}
      </div>

      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-textSecondary">
              <th className="px-4 py-2.5 font-medium">Коли / Хто</th>
              {showVehicle && <th className="px-4 py-2.5 font-medium">Авто</th>}
              <th className="px-4 py-2.5 font-medium">Категорія</th>
              <th className="px-4 py-2.5 font-medium">Сума</th>
              <th className="px-4 py-2.5 font-medium">Каса</th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Коментар</th>
              {!isReadOnly && (onEdit || canDelete) && <th className="px-4 py-2.5 font-medium w-20" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-surfaceHover transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <RecordAttribution at={r.createdAt} user={recordAuthor(r)} />
                </td>
                {showVehicle && r.Vehicle && (
                  <td className="px-4 py-3">
                    <VehicleCell vehicle={r.Vehicle} />
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
                    {r.RepairType.name}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                  <span className="text-textPrimary">${Number(r.amountUsd).toFixed(2)}</span>
                  <span className="block text-[10px] text-textSecondary">
                    {Number(r.registerAmount).toLocaleString()} {r.CashRegister.Currency.code}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-textSecondary">{r.CashRegister.name}</td>
                <td className="px-4 py-3 text-xs text-textSecondary hidden lg:table-cell max-w-[200px] truncate">
                  {r.comment || '—'}
                </td>
                {!isReadOnly && (onEdit || canDelete) && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          className="p-1.5 text-textSecondary hover:text-accent rounded transition-colors"
                          title="Редагувати"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          disabled={isPending && deletingId === r.id}
                          className="p-1.5 text-textSecondary hover:text-red-400 rounded transition-colors disabled:opacity-50"
                          title="Видалити"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
