import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { buttonVariants } from '@/components/ui/button'

interface ResourceItem {
  id: number
  type: string
  title: string
  summary: string
  price: number
  currency: string
  author_id: number
}

export const Route = createFileRoute('/_authenticated/marketplace/')({
  component: MarketplacePage,
})

function MarketplacePage() {
  const { t } = useTranslation()
  const [items, setItems] = useState<ResourceItem[]>([])
  const [keyword, setKeyword] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const pageSize = 24

  async function load(nextPage = page) {
    setError('')
    try {
      const response = await api.get<{ success: boolean; data?: { items?: ResourceItem[]; total?: number }; message?: string }>(
        `/api/marketplace/resources?p=${nextPage}&page_size=${pageSize}` +
          `&type=${encodeURIComponent(type)}&keyword=${encodeURIComponent(keyword)}`,
      )
      if (response.data.success) {
        setItems(response.data.data?.items ?? [])
        setTotal(response.data.data?.total ?? 0)
      } else {
        setError(response.data.message ?? t('无法加载资源列表'))
      }
    } catch {
      setError(t('无法加载资源列表'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, type])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <main className='mx-auto max-w-6xl space-y-6 p-8'>
      <header className='flex flex-wrap items-center justify-between gap-3'>
        <h1 className='text-2xl font-semibold'>{t('资源广场')}</h1>
        <Link className={buttonVariants({})} to='/marketplace/new'>
          {t('发布资源')}
        </Link>
      </header>

      <div className='flex flex-wrap gap-2'>
        <Input
          className='max-w-xs'
          placeholder={t('搜索标题或摘要')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setPage(1)
              void load(1)
            }
          }}
        />
        <select
          className='rounded border bg-background p-2 text-sm'
          value={type}
          onChange={(event) => {
            setType(event.target.value)
            setPage(1)
          }}
        >
          <option value=''>{t('全部类型')}</option>
          <option value='character_card'>{t('角色卡')}</option>
          <option value='tutorial'>{t('文字教程')}</option>
        </select>
        <Button variant='outline' onClick={() => { setPage(1); void load(1) }}>
          {t('搜索')}
        </Button>
      </div>

      {error && <p className='text-destructive'>{error}</p>}

      {items.length === 0 && !error && <p className='text-muted-foreground'>{t('暂无资源')}</p>}

      <section className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {items.map((item) => (
          <Link
            className='rounded-lg border p-4 transition-colors hover:border-primary'
            key={item.id}
            to='/marketplace/$resourceId'
            params={{ resourceId: String(item.id) }}
          >
            <div className='flex items-center justify-between gap-2'>
              <strong className='line-clamp-1'>{item.title}</strong>
              <Badge variant='secondary'>
                {item.type === 'character_card' ? t('角色卡') : t('教程')}
              </Badge>
            </div>
            <p className='text-muted-foreground mt-2 line-clamp-3 min-h-12 text-sm'>{item.summary}</p>
            <p className='mt-3 text-sm font-medium'>
              {item.price === 0
                ? t('免费')
                : item.currency === 'spore'
                  ? `${t('价格')}: ${item.price / 10} ${t('菌种')}`
                  : `${t('价格')}: ${item.price}`}
            </p>
          </Link>
        ))}
      </section>

      {totalPages > 1 && (
        <nav className='flex items-center justify-center gap-3'>
          <Button variant='outline' size='sm' disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('上一页')}
          </Button>
          <span className='text-muted-foreground text-sm'>
            {page} / {totalPages}
          </span>
          <Button variant='outline' size='sm' disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            {t('下一页')}
          </Button>
        </nav>
      )}
    </main>
  )
}
