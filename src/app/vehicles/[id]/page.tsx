import { getVehicleDetails, getFormDictionaries } from '@/actions/vehicles'
import { getCurrentUser } from '@/actions/auth'
import { getCashRegistersForPayment, getMonthlyRates } from '@/lib/currency'
import { hasPermission } from '@/lib/rbac'
import { toPlain } from '@/lib/serialize'
import prisma from '@/lib/prisma'
import VehicleDetailClient from '@/components/vehicles/VehicleDetailClient'
import Link from 'next/link'

export default async function VehicleDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const vehicleId = parseInt(id, 10)

  const [vehicleRes, dictRes, user, repairTypes, paymentRegisters, paymentRates, expenseCategories] = await Promise.all([
    getVehicleDetails(vehicleId),
    getFormDictionaries(),
    getCurrentUser(),
    prisma.repairType.findMany({ orderBy: { name: 'asc' } }),
    getCashRegistersForPayment(),
    getMonthlyRates(),
    prisma.expenseCategory.findMany({ orderBy: { position: 'asc' } }),
  ])

  if (!vehicleRes.success || !vehicleRes.data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <p className="text-textSecondary">Автомобіль не знайдено</p>
        <Link href="/vehicles" className="text-accent hover:underline">
          Повернутися до списку
        </Link>
      </div>
    )
  }

  const canViewProfit = user ? await hasPermission(user.id, 'vehicles.view_profit') : false

  const dbUser = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { defaultCashRegisterId: true },
      })
    : null

  return (
    <VehicleDetailClient
      vehicle={toPlain(vehicleRes.data) as unknown as Parameters<typeof VehicleDetailClient>[0]['vehicle']}
      makes={dictRes.makes}
      models={dictRes.models}
      statuses={dictRes.statuses}
      fuelTypes={dictRes.fuelTypes}
      driveTypes={dictRes.driveTypes}
      transmissions={dictRes.transmissions}
      purchaseCountries={dictRes.purchaseCountries}
      damageTypes={dictRes.damageTypes}
      repairTypes={repairTypes}
      expenseCategories={expenseCategories}
      currentUserId={user?.id ?? 0}
      paymentRegisters={paymentRegisters}
      paymentRates={paymentRates}
      canViewProfit={canViewProfit}
      userDefaultRegisterId={dbUser?.defaultCashRegisterId ?? null}
    />
  )
}
