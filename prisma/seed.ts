import { PrismaClient } from '@prisma/client'
import { truncateAll } from './seed-utils'

const prisma = new PrismaClient()

async function main() {
  console.log('Скидання бази даних...')
  await truncateAll(prisma)
  console.log('')
  console.log('Готово. База порожня — стан «щойно куплено».')
  console.log('Запустіть dev-сервер і відкрийте /login для первинного налаштування.')
  console.log('')
  console.log('Порада: очистіть cookies crm_session та crm_setup_complete у браузері,')
  console.log('або відкрийте CRM у приватному вікні.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
