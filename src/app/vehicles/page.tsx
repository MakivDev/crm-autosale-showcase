import { Suspense } from 'react'
import { getVehiclesList, getFormDictionaries } from '@/actions/vehicles'
import { getMonthlyRates, getCashRegistersForPayment } from '@/lib/currency'
import { getCurrentUser } from '@/actions/auth'
import prisma from '@/lib/prisma'
import VehiclesClient from '@/components/vehicles/VehiclesClient'

export default async function VehiclesPage() {
  const user = await getCurrentUser()
  const [listRes, dictRes, paymentRates, paymentRegisters, repairTypes, expenseCategories, dbUser] = await Promise.all([
    getVehiclesList(),
    getFormDictionaries(),
    getMonthlyRates(),
    getCashRegistersForPayment(),
    prisma.repairType.findMany({ orderBy: { name: 'asc' } }),
    prisma.expenseCategory.findMany({ orderBy: { position: 'asc' } }),
    user ? prisma.user.findUnique({ where: { id: user.id }, select: { defaultCashRegisterId: true } }) : null,
  ])

  return (
    <Suspense fallback={null}>
      <VehiclesClient
        vehicles={listRes.success ? listRes.data! : []}
        makes={dictRes.makes}
        models={dictRes.models}
        statuses={dictRes.statuses}
        fuelTypes={dictRes.fuelTypes}
        driveTypes={dictRes.driveTypes}
        transmissions={dictRes.transmissions}
        purchaseCountries={dictRes.purchaseCountries}
        paymentRates={paymentRates}
        repairTypes={repairTypes}
        expenseCategories={expenseCategories}
        paymentRegisters={paymentRegisters}
        userDefaultRegisterId={dbUser?.defaultCashRegisterId ?? null}
      />
    </Suspense>
  )
}
