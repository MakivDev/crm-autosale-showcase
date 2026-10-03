import {
  amountToUsdAtSnapshot,
  formatUsdEquivalent,
} from '@/lib/currency'
import { increasesCashBalance, isStornoDescription } from '@/lib/transaction-types'

type Props = {
  type: string
  /** UI type override (e.g. INVESTMENT while DB type is EXPENSE). */
  displayType?: string
  amount: number
  currencyCode: string
  rateUsdSnapshot?: number | null
  rateEurSnapshot?: number | null
  description?: string | null
  align?: 'left' | 'right'
}

export default function TransactionAmount({
  type,
  displayType,
  amount,
  currencyCode,
  rateUsdSnapshot,
  rateEurSnapshot,
  description,
  align = 'left',
}: Props) {
  const visualType = displayType ?? type
  const isStorno = visualType === 'STORNO' || isStornoDescription(description)
  const isPositive = increasesCashBalance(type)
  const colorClass = isStorno
    ? 'text-slate-300'
    : isPositive
    ? type === 'DEPOSIT'
      ? 'text-cyan-400'
      : 'text-green-400'
    : visualType === 'INVESTMENT' || type === 'VEHICLE_INVEST'
    ? 'text-violet-400'
    : type === 'WITHDRAW'
    ? 'text-amber-400'
    : type === 'EXPENSE'
    ? 'text-red-400'
    : 'text-blue-400'

  const usd =
    currencyCode !== 'USD'
      ? amountToUsdAtSnapshot({
          amount,
          currencyCode,
          rateUsdSnapshot,
          rateEurSnapshot,
        })
      : null

  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <span className={`font-mono font-semibold ${colorClass}`}>
        {isPositive ? '+' : '−'}
        {amount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        <span className="text-xs ml-1 text-textSecondary font-normal">{currencyCode}</span>
      </span>
      {usd != null && (
        <div className="text-[10px] text-textSecondary/80 font-mono mt-0.5">
          {formatUsdEquivalent(usd)}
        </div>
      )}
    </div>
  )
}
