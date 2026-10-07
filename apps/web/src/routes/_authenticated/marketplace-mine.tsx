import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TagInput } from '@/components/tag-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

interface MyResource {
  id: number
  type: string
  title: string
  summary?: string
  visibility: string
  status: string
  price: number
  currency: string
  tags?: string[] | null
  current_version_id: number
}

interface AcquiredResource extends MyResource {
  source: string
}

interface MyOrder {
  id: number
  resource_id: number
  amount: number
  currency: string
  status: string
  created_at: string
}

interface VersionRow {
  id: number
  version: number
  format: string
  status: string
  review_reason?: string
  created_at: string
}

interface ShareRow {
  id: number
  resource_id: number
  user_id: number
  revoked_at?: string | null
  created_at: string
}

interface EditFormState {
  title: string
  summary: string
  tags: string[]
  visibility: 'private' | 'shared' | 'public'
  price: string
  currency: 'quota' | 'spore'
}

export const Route = createFileRoute('/_authenticated/marketplace-mine')({
  component: MarketplaceMinePage,
})

function MarketplaceMinePage() {
  const { t } = useTranslation()
  const [resources, setResources] = useState<MyResource[]>([])
  const [acquired, setAcquired] = useState<AcquiredResource[]>([])
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [versionsFor, setVersionsFor] = useState<number | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])

  const [sharesFor, setSharesFor] = useState<number | null>(null)
  const [shares, setShares] = useState<ShareRow[]>([])
  const [shareUserId, setShareUserId] = useState('')
  const [shareBusy, setShareBusy] = useState(false)

  async function load() {
    setError('')
    try {
      const [res, lib, ord] = await Promise.all([
        api.get<{ success: boolean; data?: { items?: MyResource[] }; message?: string }>('/api/marketplace/user/resources?p=1&page_size=100'),
        api.get<{ success: boolean; data?: { items?: AcquiredResource[] }; message?: string }>('/api/marketplace/user/library?p=1&page_size=100'),
        api.get<{ success: boolean; data?: { items?: MyOrder[] }; message?: string }>('/api/marketplace/user/orders?p=1&page_size=100'),
      ])
      if (res.data.success) setResources(res.data.data?.items ?? [])
      else setError(res.data.message ?? t('无法加载'))
      if (lib.data.success) setAcquired(lib.data.data?.items ?? [])
      if (ord.data.success) setOrders(ord.data.data?.items ?? [])
    } catch {
      setError(t('无法加载'))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const statusLabel: Record<string, string> = {
    draft: t('待提交/审核中'),
    published: t('已上架'),
    unlisted: t('已下架'),
    deleted: t('已删除'),
  }

  const versionStatusLabel: Record<string, string> = {
    draft: t('草稿'),
    reviewing: t('审核中'),
    approved: t('已通过'),
    rejected: t('已驳回'),
  }

  const sourceLabel: Record<string, string> = {
    claim: t('领取'),
    purchase: t('购买'),
    share: t('分享'),
  }

  const formatPrice = (r: { price: number; currency: string }) =>
    r.price === 0
      ? t('免费')
      : r.currency === 'spore'
        ? `${r.price / 10} ${t('菌种')}`
        : `${r.price}`

  return (
    <main className='mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col space-y-8 overflow-y-auto p-8'>
      <h1 className='text-2xl font-semibold'>{t('我的资源与订单')}</h1>
      {error && <p className='text-destructive'>{error}</p>}

      <section className='space-y-3'>
        <h2 className='font-medium'>{t('我的资源')}</h2>
        {resources.length === 0 && <p className='text-muted-foreground'>{t('还没有发布过资源')}</p>}
        {resources.map((r) => (
          <article className='space-y-2 rounded-lg border p-4' key={r.id}>
            <div className='flex items-center justify-between'>
              <div className='min-w-0'>
                <strong className='line-clamp-1'>{r.title}</strong>
                <p className='text-muted-foreground text-sm'>
                  #{r.id} · {r.type === 'character_card' ? t('角色卡') : t('教程')} ·{' '}
                  {r.visibility === 'public' ? t('公开') : r.visibility === 'shared' ? t('指定用户') : t('仅自己')} ·{' '}
                  {formatPrice(r)}
                </p>
              </div>
              <Badge variant={r.status === 'published' ? 'default' : 'secondary'}>
                {statusLabel[r.status] ?? r.status}
              </Badge>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button size='sm' variant='outline' onClick={() => void loadEdit(r, setEditingId, setEditForm, setVersionsFor)}>
                {t('编辑')}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => void toggleVersions(r.id, versionsFor, setVersionsFor, setVersions, setError, t)}
              >
                {versionsFor === r.id ? t('收起版本') : t('版本记录')}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => void toggleShares(r.id, sharesFor, setSharesFor, setShares, setShareUserId, setError, t)}
              >
                {sharesFor === r.id ? t('收起分享') : t('分享管理')}
              </Button>
              {r.status === 'published' && (
                <Button size='sm' variant='destructive' onClick={() => void setOwnResourceStatus(r.id, 'unlist', load, setError, t)}>
                  {t('下架')}
                </Button>
              )}
              {r.status === 'unlisted' && r.visibility === 'public' && (
                <Button size='sm' variant='outline' onClick={() => void setOwnResourceStatus(r.id, 'republish', load, setError, t)}>
                  {t('重新上架')}
                </Button>
              )}
              <Link
                className='inline-flex h-8 items-center rounded-md px-3 text-sm'
                to='/marketplace/$resourceId'
                params={{ resourceId: String(r.id) }}
              >
                {t('查看')}
              </Link>
            </div>
            {editingId === r.id && editForm && (
              <EditForm
                busy={savingEdit}
                form={editForm}
                onFormChange={setEditForm}
                onCancel={() => {
                  setEditingId(null)
                  setEditForm(null)
                }}
                onSave={() => void saveEdit(r.id, editForm, setSavingEdit, setEditingId, setEditForm, load, setError, t)}
              />
            )}
            {versionsFor === r.id && (
              <div className='space-y-2 rounded border p-3'>
                {versions.length === 0 && <p className='text-muted-foreground text-sm'>{t('暂无版本')}</p>}
                {versions.map((v) => (
                  <div className='flex items-center justify-between gap-2 text-sm' key={v.id}>
                    <span>
                      v{v.version} · {v.format === 'tutorial_markdown' ? t('教程') : t('角色卡')} ·{' '}
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                    <span className='flex items-center gap-2'>
                      {v.status === 'rejected' && v.review_reason && (
                        <span className='text-destructive text-xs'>{v.review_reason}</span>
                      )}
                      <Badge variant={v.status === 'approved' ? 'default' : v.status === 'rejected' ? 'destructive' : 'secondary'}>
                        {versionStatusLabel[v.status] ?? v.status}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {sharesFor === r.id && (
              <div className='space-y-2 rounded border p-3'>
                <div className='flex flex-wrap gap-2'>
                  <Input
                    className='max-w-40'
                    placeholder={t('用户 ID')}
                    type='number'
                    value={shareUserId}
                    onChange={(event) => setShareUserId(event.target.value)}
                  />
                  <Button
                    size='sm'
                    disabled={shareBusy || !shareUserId.trim()}
                    onClick={() => void addShare(r.id, shareUserId, setShareBusy, setShareUserId, setShares, setError, t)}
                  >
                    {t('添加分享')}
                  </Button>
                </div>
                {shares.length === 0 && <p className='text-muted-foreground text-sm'>{t('还没有分享给任何用户')}</p>}
                {shares.map((s) => (
                  <div className='flex items-center justify-between gap-2 text-sm' key={s.id}>
                    <span>
                      {t('用户')} {s.user_id} · {new Date(s.created_at).toLocaleString()}
                    </span>
                    {s.revoked_at ? (
                      <Badge variant='secondary'>{t('已撤销')}</Badge>
                    ) : (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={shareBusy}
                        onClick={() => void revokeShare(r.id, s.user_id, shareBusy, setShareBusy, setShares, setError, t)}
                      >
                        {t('撤销')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className='space-y-3'>
        <h2 className='font-medium'>{t('我获取的资源')}</h2>
        {acquired.length === 0 && <p className='text-muted-foreground'>{t('还没有获取过资源')}</p>}
        {acquired.map((r) => (
          <article className='flex items-center justify-between rounded-lg border p-4' key={r.id}>
            <div className='min-w-0'>
              <strong className='line-clamp-1'>{r.title}</strong>
              <p className='text-muted-foreground text-sm'>
                #{r.id} · {r.type === 'character_card' ? t('角色卡') : t('教程')} · {formatPrice(r)}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Badge variant='outline'>{sourceLabel[r.source] ?? r.source}</Badge>
              <Link
                className='inline-flex h-8 items-center rounded-md px-3 text-sm'
                to='/marketplace/$resourceId'
                params={{ resourceId: String(r.id) }}
              >
                {t('查看')}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className='space-y-3'>
        <h2 className='font-medium'>{t('购买订单')}</h2>
        {orders.length === 0 && <p className='text-muted-foreground'>{t('暂无购买记录')}</p>}
        {orders.map((o) => (
          <article className='flex items-center justify-between rounded-lg border p-4' key={o.id}>
            <div>
              <strong>{t('资源')} #{o.resource_id}</strong>
              <p className='text-muted-foreground text-sm'>{new Date(o.created_at).toLocaleString()}</p>
            </div>
            <div className='text-right'>
              <p className='font-semibold'>
                {o.currency === 'spore' ? `${o.amount / 10} ${t('菌种')}` : o.amount}
              </p>
              <p className='text-muted-foreground text-sm'>{o.status === 'success' ? t('已完成') : o.status}</p>
            </div>
          </article>
        ))}
      </section>

      <Button variant='outline' onClick={() => void load()}>{t('刷新')}</Button>
    </main>
  )
}

async function loadEdit(
  r: MyResource,
  setEditingId: (id: number | null) => void,
  setEditForm: (form: EditFormState | null) => void,
  setVersionsFor: (id: number | null) => void,
) {
  setVersionsFor(null)
  setEditingId(r.id)
  setEditForm({
    title: r.title,
    summary: r.summary ?? '',
    tags: r.tags ?? [],
    visibility: (r.visibility as EditFormState['visibility']) ?? 'public',
    price: String(r.currency === 'spore' ? r.price / 10 : r.price),
    currency: (r.currency as EditFormState['currency']) ?? 'quota',
  })
}

async function toggleVersions(
  resourceId: number,
  versionsFor: number | null,
  setVersionsFor: (id: number | null) => void,
  setVersions: (rows: VersionRow[]) => void,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  if (versionsFor === resourceId) {
    setVersionsFor(null)
    return
  }
  try {
    const response = await api.get<{ success: boolean; data?: { items?: VersionRow[] }; message?: string }>(
      `/api/marketplace/user/resources/${resourceId}/versions?p=1&page_size=50`,
    )
    if (response.data.success) {
      setVersions(response.data.data?.items ?? [])
      setVersionsFor(resourceId)
    } else {
      setError(response.data.message ?? t('无法加载'))
    }
  } catch {
    setError(t('无法加载'))
  }
}

async function toggleShares(
  resourceId: number,
  sharesFor: number | null,
  setSharesFor: (id: number | null) => void,
  setShares: (rows: ShareRow[]) => void,
  setShareUserId: (value: string) => void,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  if (sharesFor === resourceId) {
    setSharesFor(null)
    return
  }
  try {
    const response = await api.get<{ success: boolean; data?: ShareRow[]; message?: string }>(
      `/api/marketplace/user/resources/${resourceId}/shares`,
    )
    if (response.data.success) {
      setShares(response.data.data ?? [])
      setShareUserId('')
      setSharesFor(resourceId)
    } else {
      setError(response.data.message ?? t('无法加载'))
    }
  } catch {
    setError(t('无法加载'))
  }
}

async function addShare(
  resourceId: number,
  userIdInput: string,
  setShareBusy: (busy: boolean) => void,
  setShareUserId: (value: string) => void,
  setShares: (rows: ShareRow[]) => void,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  const userId = Number(userIdInput)
  if (!Number.isInteger(userId) || userId <= 0) {
    setError(t('请输入有效的用户 ID'))
    return
  }
  setShareBusy(true)
  try {
    const response = await api.post<{ success: boolean; message?: string }>(
      `/api/marketplace/user/resources/${resourceId}/share`,
      { user_id: userId },
    )
    if (response.data.success) {
      setShareUserId('')
      await refreshShares(resourceId, setShares, setError, t)
    } else {
      setError(response.data.message ?? t('操作失败'))
    }
  } catch {
    setError(t('操作失败'))
  } finally {
    setShareBusy(false)
  }
}

async function revokeShare(
  resourceId: number,
  userId: number,
  shareBusy: boolean,
  setShareBusy: (busy: boolean) => void,
  setShares: (rows: ShareRow[]) => void,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  if (shareBusy) return
  setShareBusy(true)
  try {
    const response = await api.delete<{ success: boolean; message?: string }>(
      `/api/marketplace/user/resources/${resourceId}/share/${userId}`,
    )
    if (response.data.success) {
      await refreshShares(resourceId, setShares, setError, t)
    } else {
      setError(response.data.message ?? t('操作失败'))
    }
  } catch {
    setError(t('操作失败'))
  } finally {
    setShareBusy(false)
  }
}

async function refreshShares(
  resourceId: number,
  setShares: (rows: ShareRow[]) => void,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  try {
    const response = await api.get<{ success: boolean; data?: ShareRow[]; message?: string }>(
      `/api/marketplace/user/resources/${resourceId}/shares`,
    )
    if (response.data.success) {
      setShares(response.data.data ?? [])
    }
  } catch {
    setError(t('无法加载'))
  }
}

async function setOwnResourceStatus(
  resourceId: number,
  action: 'unlist' | 'republish',
  reload: () => Promise<void>,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  try {
    const response = await api.post<{ success: boolean; message?: string }>(
      `/api/marketplace/user/resources/${resourceId}/${action}`,
    )
    if (response.data.success) {
      await reload()
    } else {
      setError(response.data.message ?? t('操作失败'))
    }
  } catch {
    setError(t('操作失败'))
  }
}

function EditForm(props: {
  busy: boolean
  form: EditFormState
  onFormChange: (form: EditFormState) => void
  onCancel: () => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const { form, onFormChange } = props
  return (
    <div className='space-y-3 rounded border p-3'>
      <div className='space-y-1'>
        <Label>{t('标题')}</Label>
        <Input value={form.title} maxLength={200} onChange={(event) => onFormChange({ ...form, title: event.target.value })} />
      </div>
      <div className='space-y-1'>
        <Label>{t('摘要')}</Label>
        <Textarea value={form.summary} maxLength={4000} rows={2} onChange={(event) => onFormChange({ ...form, summary: event.target.value })} />
      </div>
      <div className='space-y-1'>
        <Label>{t('标签（最多 8 个，回车确认）')}</Label>
        <TagInput value={form.tags} onChange={(tags) => onFormChange({ ...form, tags })} />
      </div>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <div className='space-y-1'>
          <Label>{t('可见范围')}</Label>
          <select
            className='w-full rounded border bg-background p-2 text-sm'
            value={form.visibility}
            onChange={(event) => onFormChange({ ...form, visibility: event.target.value as EditFormState['visibility'] })}
          >
            <option value='public'>{t('公开（需审核）')}</option>
            <option value='shared'>{t('指定用户')}</option>
            <option value='private'>{t('仅自己')}</option>
          </select>
        </div>
        <div className='space-y-1'>
          <Label>{t('价格（0 为免费）')}</Label>
          <Input
            type='number'
            min={0}
            step={form.currency === 'spore' ? 0.1 : 1}
            value={form.price}
            onChange={(event) => onFormChange({ ...form, price: event.target.value })}
          />
        </div>
        <div className='space-y-1'>
          <Label>{t('收费币种')}</Label>
          <select
            className='w-full rounded border bg-background p-2 text-sm'
            value={form.currency}
            onChange={(event) => onFormChange({ ...form, currency: event.target.value as EditFormState['currency'] })}
          >
            <option value='quota'>{t('钱包额度')}</option>
            <option value='spore'>{t('菌种')}</option>
          </select>
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>{t('切换为公开会重新进入审核。')}</p>
      <div className='flex gap-2'>
        <Button size='sm' disabled={props.busy || form.title.trim() === ''} onClick={props.onSave}>
          {props.busy ? t('保存中…') : t('保存')}
        </Button>
        <Button size='sm' variant='outline' disabled={props.busy} onClick={props.onCancel}>
          {t('取消')}
        </Button>
      </div>
    </div>
  )
}

async function saveEdit(
  resourceId: number,
  form: EditFormState,
  setSavingEdit: (busy: boolean) => void,
  setEditingId: (id: number | null) => void,
  setEditForm: (form: EditFormState | null) => void,
  reload: () => Promise<void>,
  setError: (message: string) => void,
  t: (key: string) => string,
) {
  setSavingEdit(true)
  try {
    const numericPrice = Number(form.price)
    const internalPrice =
      Number.isFinite(numericPrice) && numericPrice > 0
        ? form.currency === 'spore'
          ? Math.round(numericPrice * 10)
          : Math.round(numericPrice)
        : 0
    const response = await api.put<{ success: boolean; message?: string }>(
      `/api/marketplace/user/resources/${resourceId}`,
      {
        title: form.title,
        summary: form.summary,
        tags: form.tags,
        visibility: form.visibility,
        currency: internalPrice > 0 ? form.currency : 'quota',
        price: internalPrice,
      },
    )
    if (response.data.success) {
      setEditingId(null)
      setEditForm(null)
      await reload()
    } else {
      setError(response.data.message ?? t('保存失败'))
    }
  } catch {
    setError(t('保存失败'))
  } finally {
    setSavingEdit(false)
  }
}
