import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
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
  tags?: string[] | null
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
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [tag, setTag] = useState('')
  const [appliedTag, setAppliedTag] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)
  const pageSize = 24

  // Append mode: the sentinel below triggers the next page while the viewer
  // scrolls; a filter change resets the list back to page 1 and replaces it.
  // Only the submitted keyword participates, so typing never refetches.
  const load = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      setError('')
      try {
        const response = await api.get<{
          success: boolean
          data?: { items?: ResourceItem[]; total?: number }
          message?: string
        }>(
          `/api/marketplace/resources?p=${nextPage}&page_size=${pageSize}` +
            `&type=${encodeURIComponent(type)}&keyword=${encodeURIComponent(appliedKeyword)}` +
            `&tag=${encodeURIComponent(appliedTag)}&sort=${encodeURIComponent(sort)}`,
        )
        if (response.data.success) {
          const fetched = response.data.data?.items ?? []
          setTotal(response.data.data?.total ?? 0)
          setPage(nextPage)
          setItems((previous) =>
            mode === 'replace' ? fetched : [...previous, ...fetched],
          )
        } else {
          setError(response.data.message ?? t('无法加载资源列表'))
        }
      } catch {
        setError(t('无法加载资源列表'))
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    [appliedKeyword, appliedTag, type, sort, t],
  )

  useEffect(() => {
    void load(1, 'replace')
  }, [load])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry.isIntersecting || loadingRef.current) return
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      if (page < totalPages) void load(page + 1, 'append')
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [load, page, total])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasMore = page < totalPages

  const resetAndSearch = () => {
    setAppliedKeyword(keyword)
    setAppliedTag(tag.trim())
    setItems([])
    setTotal(0)
    setPage(1)
  }

  const filterByTag = (value: string) => {
    setTag(value)
    setAppliedTag(value)
    setItems([])
    setTotal(0)
    setPage(1)
  }

  return (
    <main className='mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col space-y-6 overflow-y-auto p-8'>
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
              resetAndSearch()
            }
          }}
        />
        <Input
          className='max-w-40'
          placeholder={t('按标签筛选')}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              resetAndSearch()
            }
          }}
        />
        <select
          className='rounded border bg-background p-2 text-sm'
          value={type}
          onChange={(event) => {
            setType(event.target.value)
            setItems([])
            setTotal(0)
            setPage(1)
          }}
        >
          <option value=''>{t('全部类型')}</option>
          <option value='character_card'>{t('角色卡')}</option>
          <option value='tutorial'>{t('文字教程')}</option>
        </select>
        <select
          className='rounded border bg-background p-2 text-sm'
          value={sort}
          onChange={(event) => {
            setSort(event.target.value)
            setItems([])
            setTotal(0)
            setPage(1)
          }}
        >
          <option value=''>{t('最近更新')}</option>
          <option value='price_asc'>{t('价格从低到高')}</option>
          <option value='price_desc'>{t('价格从高到低')}</option>
        </select>
        <Button variant='outline' onClick={resetAndSearch}>
          {t('搜索')}
        </Button>
      </div>

      {appliedTag && (
        <div className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>{t('标签筛选')}：</span>
          <Badge variant='default'>{appliedTag}</Badge>
          <Button variant='ghost' size='sm' onClick={() => filterByTag('')}>
            {t('清除')}
          </Button>
        </div>
      )}

      {error && <p className='text-destructive'>{error}</p>}

      {items.length === 0 && !error && !loading && (
        <p className='text-muted-foreground'>{t('暂无资源')}</p>
      )}

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
            {(item.tags?.length ?? 0) > 0 && (
              <div className='mt-2 flex flex-wrap gap-1'>
                {item.tags!.map((itemTag) => (
                  <Badge
                    key={itemTag}
                    variant={itemTag === appliedTag ? 'default' : 'outline'}
                    className='cursor-pointer text-xs'
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      filterByTag(itemTag === appliedTag ? '' : itemTag)
                    }}
                  >
                    {itemTag}
                  </Badge>
                ))}
              </div>
            )}
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

      <div className='flex items-center justify-center gap-3 py-2' ref={sentinelRef}>
        {loading && <span className='text-muted-foreground text-sm'>{t('加载中…')}</span>}
        {!loading && hasMore && (
          <Button variant='outline' size='sm' onClick={() => void load(page + 1, 'append')}>
            {t('加载更多')}
          </Button>
        )}
        {!loading && !hasMore && items.length > 0 && (
          <span className='text-muted-foreground text-sm'>{t('没有更多了')}</span>
        )}
      </div>
    </main>
  )
}
