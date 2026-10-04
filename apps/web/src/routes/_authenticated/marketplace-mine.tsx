import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

interface MyResource {
  id: number
  type: string
  title: string
  visibility: string
  status: string
  price: number
  currency: string
  current_version_id: number
}

interface MyOrder {
  id: number
  resource_id: number
  amount: number
  currency: string
  status: string
  created_at: string
}

export const Route = createFileRoute('/_authenticated/marketplace-mine')({
  component: MarketplaceMinePage,
})

function MarketplaceMinePage() {
  const { t } = useTranslation()
  const [resources, setResources] = useState<MyResource[]>([])
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const [res, ord] = await Promise.all([
        api.get<{ success: boolean; data?: { items?: MyResource[] }; message?: string }>('/api/marketplace/user/resources?p=1&page_size=100'),
        api.get<{ success: boolean; data?: { items?: MyOrder[] }; message?: string }>('/api/marketplace/user/orders?p=1&page_size=100'),
      ])
      if (res.data.success) setResources(res.data.data?.items ?? [])
      else setError(res.data.message ?? t('无法加载'))
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

  return (
    <main className='mx-auto max-w-4xl space-y-8 p-8'>
      <h1 className='text-2xl font-semibold'>{t('我的资源与订单')}</h1>
      {error && <p className='text-destructive'>{error}</p>}

      <section className='space-y-3'>
        <h2 className='font-medium'>{t('我的资源')}</h2>
        {resources.length === 0 && <p className='text-muted-foreground'>{t('还没有发布过资源')}</p>}
        {resources.map((r) => (
          <article className='flex items-center justify-between rounded-lg border p-4' key={r.id}>
            <div>
              <strong>{r.title}</strong>
              <p className='text-muted-foreground text-sm'>
                #{r.id} · {r.type === 'character_card' ? t('角色卡') : t('教程')} ·{' '}
                {r.visibility === 'public' ? t('公开') : r.visibility === 'shared' ? t('指定用户') : t('仅自己')}
              </p>
            </div>
            <Badge variant={r.status === 'published' ? 'default' : 'secondary'}>
              {statusLabel[r.status] ?? r.status}
            </Badge>
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
