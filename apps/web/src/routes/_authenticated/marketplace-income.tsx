import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'

interface Settlement {
  id: number
  order_id: number
  author_amount: number
  currency: string
  created_at: string
  thaw_at: string
  exchanged_at?: string | null
}

type ExchangeResult = {
  exchanged_count: number
  quota_amount: number
  spore_amount: number
}

export const Route = createFileRoute('/_authenticated/marketplace-income')({
  component: MarketplaceIncomePage,
})

function MarketplaceIncomePage() {
  const { t } = useTranslation()
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [error, setError] = useState('')
  const [result, setResult] = useState<ExchangeResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    try {
      const response = await api.get<{ success: boolean; data?: { items?: Settlement[] }; message?: string }>(
        '/api/marketplace/user/settlements?p=1&page_size=100',
      )
      if (response.data.success) setSettlements(response.data.data?.items ?? [])
      else setError(response.data.message ?? t('Unable to load income records'))
    } catch { setError(t('Unable to load income records')) }
  }

  useEffect(() => { void load() }, [])

  async function exchange() {
    setSubmitting(true)
    setError('')
    try {
      const response = await api.post<{ success: boolean; data?: ExchangeResult; message?: string }>(
        '/api/marketplace/user/settlements/exchange',
      )
      if (response.data.success && response.data.data) {
        setResult(response.data.data)
        await load()
      } else {
        setError(response.data.message ?? t('Exchange failed'))
      }
    } catch { setError(t('Exchange failed')) } finally {
      setSubmitting(false)
    }
  }

  const now = Date.now()
  const thawedQuota = settlements
    .filter((s) => s.currency === 'quota' && !s.exchanged_at && new Date(s.thaw_at).getTime() <= now)
    .reduce((sum, s) => sum + s.author_amount, 0)
  const thawedSpore = settlements
    .filter((s) => s.currency === 'spore' && !s.exchanged_at && new Date(s.thaw_at).getTime() <= now)
    .reduce((sum, s) => sum + s.author_amount, 0)
  const frozenQuota = settlements
    .filter((s) => s.currency === 'quota' && !s.exchanged_at && new Date(s.thaw_at).getTime() > now)
    .reduce((sum, s) => sum + s.author_amount, 0)
  const frozenSpore = settlements
    .filter((s) => s.currency === 'spore' && !s.exchanged_at && new Date(s.thaw_at).getTime() > now)
    .reduce((sum, s) => sum + s.author_amount, 0)
  const hasThawed = settlements.some((s) => !s.exchanged_at && new Date(s.thaw_at).getTime() <= now)

  return (
    <main className='mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col space-y-8 overflow-y-auto p-8'>
      <header className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-semibold'>{t('Marketplace Income')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{t('Income from your sold resources stays frozen until thaw, then you exchange it manually.')}</p>
        </div>
        <button
          className='bg-primary text-primary-foreground rounded px-4 py-2 disabled:opacity-50'
          disabled={submitting || !hasThawed}
          onClick={() => void exchange()}
        >
          {submitting ? t('Exchanging…') : t('Exchange thawed income')}
        </button>
      </header>
      {error && <p className='text-destructive'>{error}</p>}
      {result && (
        <p className='rounded border p-3 text-sm'>
          {t('Exchanged {{number}} settlement(s): +{{quota}} quota, +{{spore}} spore.', {
            number: result.exchanged_count,
            quota: result.quota_amount,
            spore: result.spore_amount / 10,
          })}
        </p>
      )}
      <section className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        <article className='rounded-lg border p-4'><p className='text-muted-foreground text-xs'>{t('Thawed quota')}</p><p className='text-xl font-semibold'>{thawedQuota}</p></article>
        <article className='rounded-lg border p-4'><p className='text-muted-foreground text-xs'>{t('Frozen quota')}</p><p className='text-xl font-semibold'>{frozenQuota}</p></article>
        <article className='rounded-lg border p-4'><p className='text-muted-foreground text-xs'>{t('Thawed spore')}</p><p className='text-xl font-semibold'>{thawedSpore / 10}</p></article>
        <article className='rounded-lg border p-4'><p className='text-muted-foreground text-xs'>{t('Frozen spore')}</p><p className='text-xl font-semibold'>{frozenSpore / 10}</p></article>
      </section>
      <section className='space-y-3'>
        {settlements.length === 0 && <p className='text-muted-foreground'>{t('No income records yet.')}</p>}
        {settlements.map((s) => {
          const exchanged = Boolean(s.exchanged_at)
          const thawed = new Date(s.thaw_at).getTime() <= now
          return (
            <article className='flex items-center justify-between rounded-lg border p-4' key={s.id}>
              <div>
                <strong>{t('Order #{{id}}', { id: s.order_id })}</strong>
                <p className='text-muted-foreground text-sm'>
                  {t('Settled {{time}} · thaws {{thaw}}', {
                    time: new Date(s.created_at).toLocaleString(),
                    thaw: new Date(s.thaw_at).toLocaleString(),
                  })}
                </p>
              </div>
              <div className='text-right'>
                <p className='font-semibold'>
                  {s.currency === 'spore' ? `${s.author_amount / 10} ${t('spore')}` : s.author_amount}
                </p>
                <p className='text-muted-foreground text-sm'>
                  {exchanged
                    ? t('Exchanged {{time}}', { time: new Date(s.exchanged_at!).toLocaleString() })
                    : thawed
                      ? t('Ready to exchange')
                      : t('Frozen')}
                </p>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
