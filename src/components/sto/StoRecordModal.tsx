'use client'

import { useTransition } from 'react'
import { X } from 'lucide-react'
import OverlayBackdrop from '@/components/shared/OverlayBackdrop'
import OverlayPortal from '@/components/shared/OverlayPortal'
import StoRecordForm, { type StoRecordFormData } from '@/components/sto/StoRecordForm'
import NegativeBalanceConfirmModal, { usePendingOverdraftConfirm } from '@/components/shared/NegativeBalanceConfirmModal'
import { createStoRecord, updateStoRecord } from '@/actions/sto'
import { toast } from 'sonner'
import { notifyCrmRefresh } from '@/lib/crm-refresh'
import type { MonthRates, CashRegisterOption } from '@/lib/currency'
import type { StoRecordItem } from '@/components/sto/StoRecordTable'

type Props = {
  vehicleId: number
  repairTypes: { id: number; name: string }[]
  registers: CashRegisterOption[]
  rates: MonthRates
  userDefaultRegisterId?: number | null
  editRecord?: StoRecordItem | null
  onClose: () => void
  onSaved: () => void
}

export default function StoRecordModal({
  vehicleId,
  repairTypes,
  registers,
  rates,
  userDefaultRegisterId,
  editRecord,
  onClose,
  onSaved,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const isEdit = !!editRecord
  const { pending, confirmIfNeeded, handleConfirm, handleCancel } = usePendingOverdraftConfirm()

  const handleSave = async (data: StoRecordFormData) => {
    const reg = registers.find((r) => r.id === data.cashRegisterId)
    const oldAmount = isEdit ? Number(editRecord!.registerAmount) : 0
    const sameRegister = isEdit && editRecord!.CashRegister.id === data.cashRegisterId
    const chargeAmount = sameRegister ? Math.max(0, data.amount - oldAmount) : data.amount

    // Confirm must run outside startTransition — otherwise setPending is deferred
    // until the transition ends, but the transition awaits this confirm (deadlock).
    const ok = await confirmIfNeeded({
      registerName: reg?.name ?? 'Каса',
      balance: reg?.balance ?? 0,
      amount: chargeAmount,
      currencyCode: reg?.currencyCode ?? 'UAH',
    })
    if (!ok) return

    startTransition(async () => {
      const res = isEdit
        ? await updateStoRecord(editRecord!.id, {
            repairTypeId: data.repairTypeId,
            cashRegisterId: data.cashRegisterId,
            amount: data.amount,
            customRate: data.customRate,
            comment: data.comment || null,
          })
        : await createStoRecord({
            vehicleId,
            repairTypeId: data.repairTypeId,
            cashRegisterId: data.cashRegisterId,
            amount: data.amount,
            customRate: data.customRate,
            comment: data.comment || null,
          })

      if (res.success) {
        toast.success(isEdit ? 'Запис оновлено' : 'Роботу додано')
        notifyCrmRefresh()
        onSaved()
        onClose()
      } else {
        toast.error(res.error ?? 'Помилка')
      }
    })
  }

  const initial = editRecord
    ? {
        repairTypeId: editRecord.RepairType.id,
        cashRegisterId: editRecord.CashRegister.id,
        amount: Number(editRecord.registerAmount),
        customRate: null as number | null,
        comment: editRecord.comment ?? '',
      }
    : undefined

  return (
    <OverlayPortal open>
      <OverlayBackdrop onDismiss={onClose} className="fixed inset-0 bg-black/70 z-[300]" />
      <div className="fixed inset-0 z-[310] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
        <div
          className="pointer-events-auto flex flex-col w-full bg-surface border border-border shadow-elevated overflow-hidden
            max-h-[94dvh] rounded-t-2xl sm:rounded-xl sm:max-w-lg sm:max-h-[min(92dvh,720px)]"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <h3 className="font-semibold text-textPrimary">{isEdit ? 'Редагувати роботу' : 'Нова робота СТО'}</h3>
            <button type="button" onClick={onClose} className="p-1.5 rounded-md text-textSecondary hover:text-textPrimary hover:bg-surfaceHover transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <StoRecordForm
              repairTypes={repairTypes}
              registers={registers}
              rates={rates}
              userDefaultRegisterId={userDefaultRegisterId}
              initial={initial}
              onSave={handleSave}
              onCancel={onClose}
              isPending={isPending}
            />
          </div>
        </div>
      </div>
      {pending && (
        <NegativeBalanceConfirmModal
          open
          registerName={pending.registerName}
          balance={pending.balance}
          amount={pending.amount}
          currencyCode={pending.currencyCode}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </OverlayPortal>
  )
}
