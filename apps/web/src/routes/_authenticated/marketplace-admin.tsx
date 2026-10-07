import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

interface ReviewVersion {
  id: number
  resource_id: number
  version: number
  format: string
  content?: string
  normalized_json?: string
}

interface Agreement {
  id: number
  name: string
  version: string
  body: string
  share_ratio: number
  enabled: boolean
}

interface AdminResource {
  id: number
  author_id: number
  type: string
  title: string
  summary: string
  tags?: string[] | null
  visibility: string
  status: string
  price: number
  currency: string
}

interface OrderRow {
  id: number
  resource_id: number
  buyer_id: number
  author_id: number
  amount: number
  currency: string
  status: string
  created_at: string
}

export const Route = createFileRoute('/_authenticated/marketplace-admin')({
  component: MarketplaceAdminPage,
})

function MarketplaceAdminPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'review' | 'resources' | 'settings' | 'agreements' | 'orders'>('review')
  const [error, setError] = useState('')
  const pageSize = 20

  const [reviews, setReviews] = useState<ReviewVersion[]>([])
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({})
  const [reviewPage, setReviewPage] = useState(1)
  const [reviewTotal, setReviewTotal] = useState(0)

  const [adminResources, setAdminResources] = useState<AdminResource[]>([])
  const [resourceStatus, setResourceStatus] = useState('')
  const [resourceKeyword, setResourceKeyword] = useState('')
  const [resourcePage, setResourcePage] = useState(1)
  const [resourceTotal, setResourceTotal] = useState(0)

  const [maxUpload, setMaxUpload] = useState('')
  const [shareRatio, setShareRatio] = useState('')
  const [freezeMinutes, setFreezeMinutes] = useState('')

  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [agName, setAgName] = useState('')
  const [agVersion, setAgVersion] = useState('')
  const [agBody, setAgBody] = useState('')
  const [agRatio, setAgRatio] = useState('')

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [orderPage, setOrderPage] = useState(1)
  const [orderTotal, setOrderTotal] = useState(0)

  async function guard(response: { data: { success: boolean; data?: unknown; message?: string } }): Promise<boolean> {
    if (response.data.success) return true
    setError(response.data.message ?? t('操作失败'))
    return false
  }

  async function loadTab(current: typeof tab) {
    setError('')
    try {
      if (current === 'review') {
        const r = await api.get<{ success: boolean; data?: { items?: ReviewVersion[]; total?: number }; message?: string }>(`/api/marketplace/admin/reviews?p=${reviewPage}&page_size=${pageSize}`)
        if (await guard(r)) {
          setReviews(r.data.data?.items ?? [])
          setReviewTotal(r.data.data?.total ?? 0)
        }
      } else if (current === 'resources') {
        const r = await api.get<{ success: boolean; data?: { items?: AdminResource[]; total?: number }; message?: string }>(
          `/api/marketplace/admin/resources?p=${resourcePage}&page_size=${pageSize}` +
            `&status=${encodeURIComponent(resourceStatus)}&keyword=${encodeURIComponent(resourceKeyword)}`,
        )
        if (await guard(r)) {
          setAdminResources(r.data.data?.items ?? [])
          setResourceTotal(r.data.data?.total ?? 0)
        }
      } else if (current === 'settings') {
        const r = await api.get<{ success: boolean; data?: { max_upload_bytes: number; base_share_ratio: number; income_freeze_minutes: number }; message?: string }>('/api/marketplace/admin/settings')
        if (await guard(r) && r.data.data) {
          setMaxUpload(String(r.data.data.max_upload_bytes))
          setShareRatio(String(r.data.data.base_share_ratio / 100))
          setFreezeMinutes(String(r.data.data.income_freeze_minutes))
        }
      } else if (current === 'agreements') {
        const r = await api.get<{ success: boolean; data?: Agreement[]; message?: string }>('/api/marketplace/admin/agreements')
        if (await guard(r)) setAgreements(r.data.data ?? [])
      } else if (current === 'orders') {
        const r = await api.get<{ success: boolean; data?: { items?: OrderRow[]; total?: number }; message?: string }>(`/api/marketplace/admin/orders?p=${orderPage}&page_size=${pageSize}`)
        if (await guard(r)) {
          setOrders(r.data.data?.items ?? [])
          setOrderTotal(r.data.data?.total ?? 0)
        }
      }
    } catch {
      setError(t('加载失败（可能缺少对应管理权限）'))
    }
  }

  useEffect(() => {
    void loadTab(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, resourceStatus, reviewPage, resourcePage, orderPage])

  async function review(id: number, approve: boolean) {
    setError('')
    try {
      const r = await api.post<{ success: boolean; message?: string }>(
        `/api/marketplace/admin/versions/${id}/review`,
        { approve, reason: rejectReason[id] ?? '' },
      )
      if (await guard(r)) await loadTab('review')
    } catch { setError(t('操作失败')) }
  }

  async function unlist(resourceId: number) {
    setError('')
    try {
      const r = await api.post<{ success: boolean; message?: string }>(`/api/marketplace/admin/resources/${resourceId}/unlist`)
      if (await guard(r)) await loadTab(tab)
    } catch { setError(t('操作失败')) }
  }

  async function republish(resourceId: number) {
    setError('')
    try {
      const r = await api.post<{ success: boolean; message?: string }>(`/api/marketplace/admin/resources/${resourceId}/republish`)
      if (await guard(r)) await loadTab('resources')
    } catch { setError(t('操作失败')) }
  }

  async function saveSettings() {
    setError('')
    try {
      const r = await api.put<{ success: boolean; message?: string }>('/api/marketplace/admin/settings', {
        max_upload_bytes: Number(maxUpload),
        base_share_ratio: Number(shareRatio) * 100,
        income_freeze_minutes: Number(freezeMinutes),
      })
      if (await guard(r)) setError(t('设置已保存'))
    } catch { setError(t('保存失败')) }
  }

  async function createAgreement() {
    setError('')
    try {
      const r = await api.post<{ success: boolean; message?: string }>('/api/marketplace/admin/agreements', {
        name: agName,
        version: agVersion,
        body: agBody,
        share_ratio: Number(agRatio) * 100,
      })
      if (await guard(r)) {
        setAgName(''); setAgVersion(''); setAgBody(''); setAgRatio('')
        await loadTab('agreements')
      }
    } catch { setError(t('创建失败')) }
  }

  async function toggleAgreement(id: number, enabled: boolean) {
    setError('')
    try {
      const r = await api.put<{ success: boolean; message?: string }>(
        `/api/marketplace/admin/agreements/${id}/enabled`,
        { enabled },
      )
      if (await guard(r)) await loadTab('agreements')
    } catch { setError(t('操作失败')) }
  }

  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: 'review', label: t('内容审核') },
    { key: 'resources', label: t('资源管理') },
    { key: 'settings', label: t('市场设置') },
    { key: 'agreements', label: t('分成协议') },
    { key: 'orders', label: t('订单查询') },
  ]

  const resourceStatusLabel: Record<string, string> = {
    draft: t('待审核'),
    published: t('已上架'),
    unlisted: t('已下架'),
    deleted: t('已删除'),
  }

  return (
    <main className='mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col space-y-6 overflow-y-auto p-8'>
      <h1 className='text-2xl font-semibold'>{t('市场管理')}</h1>
      {error && <p className='text-destructive'>{error}</p>}
      <nav className='flex flex-wrap gap-2'>
        {tabs.map((item) => (
          <Button key={item.key} variant={tab === item.key ? 'default' : 'outline'} size='sm' onClick={() => setTab(item.key)}>
            {item.label}
          </Button>
        ))}
      </nav>

      {tab === 'review' && (
        <section className='space-y-3'>
          {reviews.length === 0 && <p className='text-muted-foreground'>{t('没有待审核内容')}</p>}
          {reviews.map((v) => (
            <article className='space-y-2 rounded-lg border p-4' key={v.id}>
              <div className='flex items-center justify-between'>
                <strong>#{v.id} · {t('资源')} {v.resource_id} · v{v.version}</strong>
                <Badge variant='secondary'>{v.format === 'tutorial_markdown' ? t('教程') : t('角色卡')}</Badge>
              </div>
              <details>
                <summary className='cursor-pointer text-sm'>{t('查看内容')}</summary>
                <pre className='mt-2 max-h-64 overflow-auto rounded border p-2 text-xs'>
                  {v.content ?? v.normalized_json ?? ''}
                </pre>
              </details>
              <Input
                placeholder={t('驳回原因（必填）')}
                value={rejectReason[v.id] ?? ''}
                onChange={(event) => setRejectReason({ ...rejectReason, [v.id]: event.target.value })}
              />
              <div className='flex gap-2'>
                <Button size='sm' onClick={() => void review(v.id, true)}>{t('通过')}</Button>
                <Button size='sm' variant='destructive' disabled={!(rejectReason[v.id] ?? '').trim()} onClick={() => void review(v.id, false)}>
                  {t('驳回')}
                </Button>
                <Button size='sm' variant='ghost' onClick={() => void unlist(v.resource_id)}>{t('下架该资源')}</Button>
              </div>
            </article>
          ))}
          <Pager page={reviewPage} total={reviewTotal} pageSize={pageSize} onPage={setReviewPage} />
        </section>
      )}

      {tab === 'resources' && (
        <section className='space-y-3'>
          <div className='flex flex-wrap gap-2'>
            <Input
              className='max-w-xs'
              placeholder={t('搜索标题或摘要')}
              value={resourceKeyword}
              onChange={(event) => setResourceKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadTab('resources')
              }}
            />
            <select
              className='rounded border bg-background p-2 text-sm'
              value={resourceStatus}
              onChange={(event) => {
                setResourcePage(1)
                setResourceStatus(event.target.value)
              }}
            >
              <option value=''>{t('全部状态')}</option>
              <option value='published'>{t('已上架')}</option>
              <option value='unlisted'>{t('已下架')}</option>
              <option value='draft'>{t('待审核')}</option>
            </select>
            <Button variant='outline' onClick={() => void loadTab('resources')}>{t('搜索')}</Button>
          </div>
          {adminResources.length === 0 && <p className='text-muted-foreground'>{t('暂无资源')}</p>}
          {adminResources.map((r) => (
            <article className='space-y-2 rounded-lg border p-4' key={r.id}>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='min-w-0'>
                  <strong className='line-clamp-1'>{r.title}</strong>
                  <p className='text-muted-foreground text-sm'>
                    #{r.id} · {t('作者')} {r.author_id} · {r.type === 'character_card' ? t('角色卡') : t('教程')} ·{' '}
                    {r.price === 0
                      ? t('免费')
                      : r.currency === 'spore'
                        ? `${r.price / 10} ${t('菌种')}`
                        : r.price}
                  </p>
                </div>
                <Badge variant={r.status === 'published' ? 'default' : 'secondary'}>
                  {resourceStatusLabel[r.status] ?? r.status}
                </Badge>
              </div>
              {(r.tags?.length ?? 0) > 0 && (
                <div className='flex flex-wrap gap-1'>
                  {r.tags!.map((tag) => (
                    <Badge key={tag} variant='outline' className='text-xs'>
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <div className='flex gap-2'>
                {r.status === 'published' && (
                  <Button size='sm' variant='destructive' onClick={() => void unlist(r.id)}>
                    {t('下架')}
                  </Button>
                )}
                {r.status === 'unlisted' && r.visibility === 'public' && (
                  <Button size='sm' variant='outline' onClick={() => void republish(r.id)}>
                    {t('恢复上架')}
                  </Button>
                )}
              </div>
            </article>
          ))}
          <Pager page={resourcePage} total={resourceTotal} pageSize={pageSize} onPage={setResourcePage} />
        </section>
      )}

      {tab === 'settings' && (
        <section className='space-y-4 rounded-lg border p-5'>
          <div className='space-y-1'>
            <Label>{t('单文件上传上限（字节）')}</Label>
            <Input type='number' value={maxUpload} onChange={(event) => setMaxUpload(event.target.value)} />
          </div>
          <div className='space-y-1'>
            <Label>{t('基础分成比例（%，0-100）')}</Label>
            <Input type='number' value={shareRatio} onChange={(event) => setShareRatio(event.target.value)} />
          </div>
          <div className='space-y-1'>
            <Label>{t('收入冻结时长（分钟）')}</Label>
            <Input type='number' value={freezeMinutes} onChange={(event) => setFreezeMinutes(event.target.value)} />
          </div>
          <Button onClick={() => void saveSettings()}>{t('保存设置')}</Button>
        </section>
      )}

      {tab === 'agreements' && (
        <section className='space-y-4'>
          <div className='space-y-3 rounded-lg border p-5'>
            <h3 className='font-medium'>{t('新建协议')}</h3>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <Input placeholder={t('协议名称')} value={agName} onChange={(event) => setAgName(event.target.value)} />
              <Input placeholder={t('版本号')} value={agVersion} onChange={(event) => setAgVersion(event.target.value)} />
              <Input placeholder={t('作者分成比例（%）')} value={agRatio} onChange={(event) => setAgRatio(event.target.value)} />
            </div>
            <Textarea placeholder={t('协议正文')} value={agBody} onChange={(event) => setAgBody(event.target.value)} />
            <Button disabled={!agName || !agVersion || !agBody || !agRatio} onClick={() => void createAgreement()}>
              {t('创建协议')}
            </Button>
          </div>
          {agreements.map((a) => (
            <article className='flex items-center justify-between rounded-lg border p-4' key={a.id}>
              <div className='min-w-0'>
                <strong>{a.name}</strong>
                <p className='text-muted-foreground text-sm'>{t('版本')} {a.version} · {t('分成')} {a.share_ratio / 100}%</p>
                <details className='mt-1'>
                  <summary className='cursor-pointer text-xs'>{t('查看协议正文')}</summary>
                  <div className='mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded border p-2 text-xs'>{a.body}</div>
                </details>
              </div>
              <div className='flex shrink-0 items-center gap-2'>
                <Badge variant={a.enabled ? 'default' : 'secondary'}>{a.enabled ? t('启用') : t('停用')}</Badge>
                <Button size='sm' variant={a.enabled ? 'outline' : 'default'} onClick={() => void toggleAgreement(a.id, !a.enabled)}>
                  {a.enabled ? t('停用') : t('启用')}
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === 'orders' && (
        <section className='space-y-3'>
          {orders.length === 0 && <p className='text-muted-foreground'>{t('暂无订单')}</p>}
          {orders.map((o) => (
            <article className='flex items-center justify-between rounded-lg border p-4' key={o.id}>
              <div>
                <strong>{t('订单')} #{o.id}</strong>
                <p className='text-muted-foreground text-sm'>
                  {t('买家')} {o.buyer_id} → {t('作者')} {o.author_id} · {t('资源')} {o.resource_id} · {new Date(o.created_at).toLocaleString()}
                </p>
              </div>
              <p className='font-semibold'>{o.currency === 'spore' ? `${o.amount / 10} ${t('菌种')}` : o.amount}</p>
            </article>
          ))}
          <Pager page={orderPage} total={orderTotal} pageSize={pageSize} onPage={setOrderPage} />
        </section>
      )}
    </main>
  )
}

function Pager(props: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))
  if (props.total === 0) return null
  return (
    <nav className='flex items-center justify-center gap-3'>
      <Button variant='outline' size='sm' disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>
        {t('上一页')}
      </Button>
      <span className='text-muted-foreground text-sm'>
        {props.page} / {totalPages}
      </span>
      <Button variant='outline' size='sm' disabled={props.page >= totalPages} onClick={() => props.onPage(props.page + 1)}>
        {t('下一页')}
      </Button>
    </nav>
  )
}
