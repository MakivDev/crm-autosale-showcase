'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  HardDrive, Cloud, Plus, Trash2, Download, RefreshCw, RotateCcw, AlertTriangle,
} from 'lucide-react'
import {
  getBackupJob,
  getBackupsStatus,
  startCreateBackup,
  startDeleteBackup,
  startPullBackup,
  startRestoreBackup,
  startSyncBackup,
} from '@/actions/backups'
import { useHasPermission } from '@/contexts/PermissionsContext'

type BackupRow = {
  id: string
  sizeBytes?: number
  sizeHuman?: string
  createdAt?: string | null
  purpose?: string
  local: boolean
  remote: boolean
}

type StatusData = {
  configured: boolean
  local: {
    id: string
    sizeBytes?: number
    sizeHuman?: string
    createdAt?: string | null
    purpose?: string
  }[]
  remote: { id: string }[]
  s3Configured: boolean
  localKeepDays: number
  project: string
  busy?: boolean
}

function mergeRows(data: StatusData): BackupRow[] {
  const map = new Map<string, BackupRow>()
  for (const b of data.local) {
    map.set(b.id, {
      id: b.id,
      sizeBytes: b.sizeBytes,
      sizeHuman: b.sizeHuman,
      createdAt: b.createdAt,
      purpose: b.purpose || 'manual',
      local: true,
      remote: false,
    })
  }
  for (const b of data.remote) {
    const prev = map.get(b.id)
    if (prev) prev.remote = true
    else map.set(b.id, { id: b.id, purpose: 'manual', local: false, remote: true })
  }
  return Array.from(map.values()).sort((a, b) => (a.id < b.id ? 1 : -1))
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default function BackupsTab() {
  const canDanger = useHasPermission('settings.danger')
  const [data, setData] = useState<StatusData | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [jobLabel, setJobLabel] = useState('')
  const [isPending, startTransition] = useTransition()
  const [jobRunning, setJobRunning] = useState(false)
  const [createMode, setCreateMode] = useState<'local' | 'sync' | 'remote'>('local')
  const [deleteTarget, setDeleteTarget] = useState<BackupRow | null>(null)
  const [deleteWhere, setDeleteWhere] = useState<'local' | 'remote' | 'both'>('local')
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [restorePhrase, setRestorePhrase] = useState('')
  const abortPoll = useRef(false)

  const busy = jobRunning || Boolean(data?.busy)

  const load = useCallback(() => {
    startTransition(async () => {
      setError('')
      const res = await getBackupsStatus()
      if (!res.success) {
        setError(res.error || 'Помилка')
        return
      }
      setData(res.data)
    })
  }, [])

  useEffect(() => {
    if (canDanger) load()
  }, [canDanger, load])

  useEffect(() => () => { abortPoll.current = true }, [])

  const waitForJob = async (jobId: string) => {
    abortPoll.current = false
    setJobRunning(true)
    try {
      for (let i = 0; i < 600; i++) {
        if (abortPoll.current) return { ok: false as const, error: 'Скасовано' }
        await sleep(2000)
        let res: Awaited<ReturnType<typeof getBackupJob>>
        try {
          res = await getBackupJob(jobId)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          // Next інколи валиться на великій/битій відповіді — операція на агенті може вже йти
          if (/unexpected response|Failed to fetch|network|fetch|timeout/i.test(msg)) {
            continue
          }
          return { ok: false as const, error: msg }
        }
        if (!res.success) {
          if (
            i < 5 ||
            /fetch|network|timeout|звʼязку|unexpected/i.test(res.error || '')
          ) {
            continue
          }
          return { ok: false as const, error: res.error || 'Помилка job' }
        }
        if (res.data.status === 'running') continue
        const result = res.data.result
        if (res.data.status === 'done' && result?.ok) {
          return { ok: true as const, result }
        }
        return {
          ok: false as const,
          error: result?.error || 'Операція завершилась з помилкою',
        }
      }
      return { ok: false as const, error: 'Таймаут очікування (≈20 хв)' }
    } finally {
      setJobRunning(false)
      setJobLabel('')
    }
  }

  const runJob = (
    label: string,
    start: () => Promise<{ success: boolean; error?: string; data?: { jobId: string } }>,
    onDone: (result: { id?: string | null; sync?: boolean; mode?: string; remoteOnly?: boolean }) => void,
  ) => {
    startTransition(async () => {
      setError('')
      setMessage('')
      setJobLabel(label)
      try {
        let started: { success: boolean; error?: string; data?: { jobId: string } }
        try {
          started = await start()
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          // Старт міг пройти на агенті, а відповідь Next зірвалась — оновимо список
          load()
          setError(
            /unexpected response/i.test(msg)
              ? 'Відповідь сервера обірвалась, але операція могла виконатись. Оновіть список бекапів.'
              : msg,
          )
          setJobLabel('')
          return
        }
        if (!started.success || !started.data?.jobId) {
          setError(started.error || 'Не вдалося запустити')
          setJobLabel('')
          return
        }
        setMessage(`${label}… це може зайняти кілька хвилин`)
        const done = await waitForJob(started.data.jobId)
        if (!done.ok) {
          load()
          setError(done.error)
          return
        }
        onDone(done.result || {})
        load()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Помилка'
        load()
        setError(
          /unexpected response/i.test(msg)
            ? 'Відповідь сервера обірвалась. Перевірте список — бекап міг уже створитись.'
            : msg,
        )
        setJobLabel('')
        setJobRunning(false)
      }
    })
  }

  if (!canDanger) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6 text-sm text-textSecondary">
        Потрібен дозвіл <span className="font-mono text-textPrimary">settings.danger</span>.
      </div>
    )
  }

  const rows = data ? mergeRows(data) : []
  const locked = isPending || busy

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-textPrimary">Бекапи</h2>
            <p className="text-xs text-textSecondary mt-0.5">
              Повний архів: БД + фото + PDF. Локально ~{data?.localKeepDays ?? 3} дні;
              remote — Object Storage (GFS), якщо налаштовано.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={locked}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md text-textSecondary hover:text-textPrimary disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isPending || jobRunning ? 'animate-spin' : ''}`} />
            Оновити
          </button>
        </div>

        <div className="p-5 space-y-4">
          {data && !data.configured && (
            <div className="flex gap-3 p-3 rounded-md border border-amber-500/30 bg-amber-500/5 text-sm text-amber-200/90">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                Агент бекапів не активний. У <span className="font-mono">.env</span> задайте{' '}
                <span className="font-mono">BACKUP_AGENT_TOKEN</span> (мін. 16 символів),
                перебудуйте <span className="font-mono">backup-agent</span> і перезапустіть compose.
              </div>
            </div>
          )}

          {data?.configured && (
            <div className="flex flex-wrap items-end gap-3 p-4 rounded-md border border-border bg-background">
              <div className="space-y-1.5">
                <label className="text-xs text-textSecondary">Створити бекап</label>
                <select
                  value={createMode}
                  onChange={(e) => setCreateMode(e.target.value as 'local' | 'sync' | 'remote')}
                  className="block bg-surface border border-border rounded px-3 py-2 text-sm text-textPrimary min-w-[280px]"
                  disabled={locked}
                >
                  <option value="local">Лише локально (VPS)</option>
                  <option value="sync" disabled={!data.s3Configured}>
                    Локально + перенести в Object Storage
                    {!data.s3Configured ? ' (S3 не налаштовано)' : ''}
                  </option>
                  <option value="remote" disabled={!data.s3Configured}>
                    Лише перенесення (створити й залишити тільки remote)
                    {!data.s3Configured ? ' (S3 не налаштовано)' : ''}
                  </option>
                </select>
              </div>
              <button
                type="button"
                disabled={locked || !data.configured}
                onClick={() => {
                  const labels = {
                    local: 'Створення бекапу',
                    sync: 'Створення + sync',
                    remote: 'Створення → лише remote',
                  } as const
                  runJob(
                    labels[createMode],
                    () => startCreateBackup({ mode: createMode }),
                    (result) => {
                      if (createMode === 'remote') {
                        setMessage(result.id ? `Готово на remote: ${result.id}` : 'Бекап на remote')
                      } else {
                        setMessage(
                          result.id
                            ? `Готово: ${result.id}${createMode === 'sync' ? ' (+ remote)' : ''}`
                            : 'Бекап створено',
                        )
                      }
                    },
                  )
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-background rounded-md text-sm font-semibold hover:bg-accent/90 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {jobRunning ? (jobLabel || 'Працює...') : 'Створити бекап'}
              </button>
              <div className="text-xs text-textSecondary flex items-center gap-3 ml-auto">
                <span className="inline-flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5" /> локально: {data.local.length}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Cloud className="w-3.5 h-3.5" /> remote: {data.s3Configured ? data.remote.length : '—'}
                </span>
              </div>
            </div>
          )}

          {jobRunning && (
            <p className="text-sm text-amber-300/90">
              {jobLabel || 'Операція'} виконується у фоні. Не закривайте вкладку — статус оновлюється автоматично.
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {message && !error && <p className="text-sm text-emerald-400">{message}</p>}

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surfaceHover text-[11px] uppercase text-textSecondary">
                <tr>
                  <th className="px-4 py-2.5 text-left">ID</th>
                  <th className="px-4 py-2.5 text-left">Розмір</th>
                  <th className="px-4 py-2.5 text-left">Де</th>
                  <th className="px-4 py-2.5 text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!data && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-textSecondary text-center">
                      {isPending ? 'Завантаження...' : 'Немає даних'}
                    </td>
                  </tr>
                )}
                {data && rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-textSecondary text-center">
                      Бекапів ще немає
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surfaceHover">
                    <td className="px-4 py-3 font-mono text-textPrimary">
                      <div className="flex flex-col gap-1">
                        <span>{row.id}</span>
                        {row.purpose === 'pre-restore' && (
                          <span className="text-[11px] font-sans font-medium text-amber-300/90">
                            захисна копія перед restore
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-textSecondary">{row.sizeHuman || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.purpose === 'pre-restore' && (
                          <span className="text-[11px] px-2 py-0.5 rounded border border-amber-500/40 text-amber-300 bg-amber-500/10">
                            захисна
                          </span>
                        )}
                        {row.local && (
                          <span className="text-[11px] px-2 py-0.5 rounded border border-border text-textSecondary">
                            локально
                          </span>
                        )}
                        {row.remote && (
                          <span className="text-[11px] px-2 py-0.5 rounded border border-accent/40 text-accent">
                            remote
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {row.local && !row.remote && data?.s3Configured && (
                          <button
                            type="button"
                            disabled={locked}
                            title="Перенести в Object Storage"
                            onClick={() =>
                              runJob(`Sync ${row.id}`, () => startSyncBackup(row.id), () => {
                                setMessage(`Перенесено ${row.id}`)
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-accent/40 rounded text-accent hover:bg-accent/10 disabled:opacity-50"
                          >
                            <Cloud className="w-3.5 h-3.5" /> Sync
                          </button>
                        )}
                        {!row.local && row.remote && (
                          <button
                            type="button"
                            disabled={locked}
                            title="Підтягнути локально"
                            onClick={() =>
                              runJob(`Pull ${row.id}`, () => startPullBackup(row.id), () => {
                                setMessage(`Підтягнуто ${row.id}`)
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded text-textSecondary hover:text-textPrimary disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" /> Pull
                          </button>
                        )}
                        {(row.local || row.remote) && (
                          <button
                            type="button"
                            disabled={locked}
                            title={row.local ? 'Відновити' : 'Pull (якщо треба) + відновити'}
                            onClick={() => {
                              setRestoreId(row.id)
                              setRestorePhrase('')
                              setError('')
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-amber-500/40 rounded text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Restore
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={locked}
                          title="Видалити"
                          onClick={() => {
                            setDeleteTarget(row)
                            setDeleteWhere(
                              row.local && row.remote ? 'both' : row.remote ? 'remote' : 'local',
                            )
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-red-500/30 rounded text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Видалити
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Закрити"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-surface border border-border rounded-lg p-5 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-textPrimary">Видалити бекап</h3>
            <p className="text-xs text-textSecondary font-mono">{deleteTarget.id}</p>
            <select
              value={deleteWhere}
              onChange={(e) => setDeleteWhere(e.target.value as typeof deleteWhere)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm"
            >
              {deleteTarget.local && <option value="local">Лише локально</option>}
              {deleteTarget.remote && <option value="remote">Лише remote</option>}
              {deleteTarget.local && deleteTarget.remote && (
                <option value="both">Локально і remote</option>
              )}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 text-sm border border-border rounded text-textSecondary"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  const id = deleteTarget.id
                  const where = deleteWhere
                  setDeleteTarget(null)
                  runJob(`Видалення ${id}`, () => startDeleteBackup(id, where), () => {
                    setMessage(`Видалено ${id}`)
                  })
                }}
                className="px-3 py-2 text-sm bg-red-500/15 border border-red-500 text-red-400 rounded hover:bg-red-500 hover:text-white disabled:opacity-50"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Закрити"
            onClick={() => setRestoreId(null)}
          />
          <div className="relative bg-surface border border-red-500/30 rounded-lg p-5 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-red-400">Відновити бекап</h3>
            <p className="text-xs text-textSecondary">
              Буде замінено БД, фото і PDF станом з{' '}
              <span className="font-mono text-textPrimary">{restoreId}</span>. Якщо бекапу
              немає локально — спочатку підтягнеться з Object Storage. Перед restore
              автоматично створюється захисна копія поточного стану (pre-restore) — це
              нормально, не ручний бекап. Введіть{' '}
              <span className="font-mono text-red-400">ВІДНОВИТИ БЕКАП</span>.
            </p>
            <input
              value={restorePhrase}
              onChange={(e) => setRestorePhrase(e.target.value)}
              placeholder="ВІДНОВИТИ БЕКАП"
              className="w-full bg-background border border-red-500/30 rounded px-3 py-2 text-sm font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRestoreId(null)}
                className="px-3 py-2 text-sm border border-border rounded text-textSecondary"
              >
                Скасувати
              </button>
              <button
                type="button"
                disabled={locked || restorePhrase !== 'ВІДНОВИТИ БЕКАП'}
                onClick={() => {
                  const id = restoreId
                  const phrase = restorePhrase
                  setRestoreId(null)
                  runJob(`Restore ${id}`, () => startRestoreBackup(id, phrase), () => {
                    setMessage(`Відновлено з ${id}. Оновіть сторінку.`)
                  })
                }}
                className="px-3 py-2 text-sm bg-red-500/15 border border-red-500 text-red-400 rounded disabled:opacity-40"
              >
                Відновити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
