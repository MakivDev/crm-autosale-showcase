import { redirect } from 'next/navigation'
import { getUsersList, getPermissionsCatalog } from '@/actions/users'
import { getCashRegisters } from '@/actions/settings'
import { getCurrentUser } from '@/actions/auth'
import { getUserPermissionCodes, hasPermission } from '@/lib/rbac'
import UsersClient from '@/components/users/UsersClient'
import { toPlain } from '@/lib/serialize'

export default async function UsersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const perms = await getUserPermissionCodes(user.id)
  if (!perms.includes('users.view')) redirect('/')

  const [usersRes, permRes, regRes, canCreate, canEdit, canDelete] = await Promise.all([
    getUsersList(),
    getPermissionsCatalog(),
    getCashRegisters(),
    hasPermission(user.id, 'users.create'),
    hasPermission(user.id, 'users.edit'),
    hasPermission(user.id, 'users.delete'),
  ])

  const users = usersRes.success && usersRes.data ? toPlain(usersRes.data) : []
  const permissions = permRes.success && permRes.data ? toPlain(permRes.data) : []
  const registers = regRes.success && regRes.data ? toPlain(regRes.data) : []

  return (
    <UsersClient
      users={users as Parameters<typeof UsersClient>[0]['users']}
      permissions={permissions as Parameters<typeof UsersClient>[0]['permissions']}
      registers={registers as Parameters<typeof UsersClient>[0]['registers']}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      currentUserId={user.id}
    />
  )
}
