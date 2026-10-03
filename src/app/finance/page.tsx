import FinanceClient from '@/components/finance/FinanceClient'
import { getFinancePageData } from '@/actions/finance'

type SearchParams = { register?: string }

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const data = await getFinancePageData()
  const registerParam = params.register ? Number(params.register) : null
  const initialRegisterId =
    registerParam && data.registers.some((r) => r.id === registerParam)
      ? registerParam
      : null

  return (
    <FinanceClient
      registers={data.registers}
      transactions={data.transactions}
      deletedTransactions={data.deletedTransactions}
      expenseCategories={data.expenseCategories}
      vehicles={data.vehicles}
      statuses={data.statuses}
      driveTypes={data.driveTypes}
      transmissions={data.transmissions}
      customsDebt={data.customsDebt}
      customsDebtors={data.customsDebtors}
      deliveryPending={data.deliveryPending}
      stockCapitalHistory={data.stockCapitalHistory}
      rates={data.rates}
      stockCapital={data.stockCapital}
      periodPnl={data.periodPnl}
      initialRegisterId={initialRegisterId}
    />
  )
}
