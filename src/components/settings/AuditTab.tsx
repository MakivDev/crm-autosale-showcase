'use client'

import { useState, useTransition, useEffect, Fragment } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getAuditLogs } from '@/actions/settings'
import Pagination from '@/components/shared/Pagination'
import RecordAttribution from '@/components/shared/RecordAttribution'

type AuditLogRow = {
  id: number
  action: string
  entityType: string
  entityId: number
  details: unknown
  createdAt: string | Date
  User: { id: number; fullName: string; username: string } | null
}

export default function AuditTab() {
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [users, setUsers] = useState<{ id: number; fullName: string; username: string }[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(25)
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = (p = page) => {
    startTransition(async () => {
      const res = await getAuditLogs({
        userId: userId ? Number(userId) : undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page: p,
        perPage,
      })
      if (res.success && res.data) {
        setLogs(res.data.logs.map((l) => ({
          ...l,
          createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
        })))
        setTotal(res.data.total)
        setUsers(res.data.users)
        setPage(res.data.page)
      }
    })
  }

  useEffect(() => { load(1) }, [])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="bg-background border border-border rounded px-3 py-2 text-sm">
          <option value="">Усі користувачі</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.fullName}</option>
          ))}
        </select>
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Дія (CREATE, UPDATE...)" className="bg-background border border-border rounded px-3 py-2 text-sm" />
        <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Тип обʼєкта" className="bg-background border border-border rounded px-3 py-2 text-sm" />
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-background border border-border rounded px-3 py-2 text-sm" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-background border border-border rounded px-3 py-2 text-sm" />
      </div>
      <button
        type="button"
        onClick={() => load(1)}
        disabled={isPending}
        className="px-4 py-2 bg-accent text-background rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
      >
        {isPending ? 'Завантаження...' : 'Застосувати фільтри'}
      </button>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surfaceHover text-[11px] uppercase text-textSecondary">
              <tr>
                <th className="px-4 py-2.5 text-left">Коли</th>
                <th className="px-4 py-2.5 text-left">Хто</th>
                <th className="px-4 py-2.5 text-left">Дія</th>
                <th className="px-4 py-2.5 text-left">Обʼєкт</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr className="hover:bg-surfaceHover">
                    <td className="px-4 py-3">
                      <RecordAttribution
                        at={log.createdAt}
                        user={log.User ? { fullName: log.User.fullName, username: log.User.username } : null}
                        showUser={false}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs">{log.User?.fullName ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono">{log.action}</td>
                    <td className="px-4 py-3 text-xs">{log.entityType} #{log.entityId}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)} className="text-textSecondary hover:text-accent">
                        {expandedId === log.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-details`}>
                      <td colSpan={5} className="px-4 py-3 bg-accent/5">
                        <pre className="text-[11px] text-textSecondary overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && !isPending && (
          <p className="text-center text-sm text-textSecondary py-8">Записів немає</p>
        )}
      </div>

      {total > perPage && (
        <Pagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => load(p)}
          onPerPageChange={() => {}}
        />
      )}
    </div>
  )
}
