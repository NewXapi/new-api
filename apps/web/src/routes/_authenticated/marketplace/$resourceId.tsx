import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Markdown } from '@/components/ui/markdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

interface ResourceInfo {
  id: number
  type: string
  title: string
  summary: string
  price: number
  currency: string
  visibility: string
  status: string
}

interface VersionInfo {
  id: number
  format: string
  content?: string
  normalized_json?: string
}

const FIELD_LABELS: Record<string, string> = {
  name: '名字',
  first_mes: '出场白',
  description: '人物设定',
  personality: '性格',
  scenario: '场景',
  mes_example: '对话示例',
  system_prompt: '系统提示词',
  creator_notes: '作者注',
}

export const Route = createFileRoute('/_authenticated/marketplace/$resourceId')({
  component: ResourceDetailPage,
})

function ResourceDetailPage() {
  const { t } = useTranslation()
  const { resourceId } = Route.useParams()
  const [resource, setResource] = useState<ResourceInfo | null>(null)
  const [version, setVersion] = useState<VersionInfo | null>(null)
  const [mobileFields, setMobileFields] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setError('')
    try {
      const response = await api.get<{
        success: boolean
        data?: { resource: ResourceInfo; version: VersionInfo; mobile_fields?: Record<string, string> | null }
        message?: string
      }>(`/api/marketplace/resources/${encodeURIComponent(resourceId)}/content`)
      if (response.data.success && response.data.data) {
        setResource(response.data.data.resource)
        setVersion(response.data.data.version)
        setMobileFields(response.data.data.mobile_fields ?? null)
      } else {
        setError(response.data.message ?? t('无法加载资源'))
      }
    } catch {
      setError(t('无法加载资源'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId])

  async function acquire(kind: 'claim' | 'purchase') {
    setBusy(true)
    setActionError('')
    try {
      const headers: Record<string, string> = {}
      if (kind === 'purchase') {
        headers['Idempotency-Key'] = `web-${resourceId}-${Date.now()}`
      }
      const response = await api.post<{ success: boolean; message?: string }>(
        `/api/marketplace/user/resources/${encodeURIComponent(resourceId)}/${kind}`,
        {},
        { headers },
      )
      if (response.data.success) {
        await load()
      } else {
        setActionError(response.data.message ?? t('操作失败'))
      }
    } catch {
      setActionError(t('操作失败'))
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    setActionError('')
    try {
      const response = await api.get<Blob>(
        `/api/marketplace/resources/${encodeURIComponent(resourceId)}/download`,
        { responseType: 'blob' },
      )
      const extension = version?.format === 'character_card_png' ? 'png' : version?.format === 'character_card_json' ? 'json' : 'md'
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `resource-${resourceId}.${extension}`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setActionError(t('下载失败，可能尚未获得访问权限'))
    }
  }

  if (error) {
    return (
      <main className='mx-auto max-w-3xl space-y-4 p-8'>
        <p className='text-destructive'>{error}</p>
        {(error.includes('权限') || error.includes('购买') || error.includes('审核')) && null}
        <Button variant='outline' onClick={() => window.history.back()}>{t('返回')}</Button>
      </main>
    )
  }

  if (!resource || !version) {
    return <main className='mx-auto max-w-3xl p-8'>{t('加载中…')}</main>
  }

  const isCharacterCard = resource.type === 'character_card'

  return (
    <main className='mx-auto max-w-4xl space-y-6 p-8'>
      <header className='space-y-2'>
        <div className='flex items-center gap-2'>
          <h1 className='text-2xl font-semibold'>{resource.title}</h1>
          <Badge variant='secondary'>{isCharacterCard ? t('角色卡') : t('教程')}</Badge>
        </div>
        {resource.summary && <p className='text-muted-foreground'>{resource.summary}</p>}
        <p className='text-sm font-medium'>
          {resource.price === 0
            ? t('免费')
            : resource.currency === 'spore'
              ? `${t('价格')}: ${resource.price / 10} ${t('菌种')}`
              : `${t('价格')}: ${resource.price}`}
        </p>
      </header>

      {actionError && <p className='text-destructive'>{actionError}</p>}

      <div className='flex flex-wrap gap-2'>
        <Button onClick={() => void download()}>{t('下载')}</Button>
        {resource.price === 0 && (
          <Button variant='outline' disabled={busy} onClick={() => void acquire('claim')}>
            {t('领取到我的资源')}
          </Button>
        )}
        {resource.price > 0 && (
          <Button variant='outline' disabled={busy} onClick={() => void acquire('purchase')}>
            {t('购买')}
          </Button>
        )}
      </div>

      {isCharacterCard && mobileFields && (
        <section className='space-y-3'>
          <h2 className='font-medium'>{t('角色卡字段（小手机逐项复制）')}</h2>
          {Object.entries(mobileFields).map(([key, value]) => (
            <article className='rounded-lg border p-4' key={key}>
              <div className='flex items-center justify-between'>
                <strong className='text-sm'>{FIELD_LABELS[key] ?? key}</strong>
                <CopyButton value={value} />
              </div>
              <p className='text-muted-foreground mt-2 whitespace-pre-wrap text-sm'>{value}</p>
            </article>
          ))}
        </section>
      )}

      {resource.type === 'tutorial' && version.content && (
        <section className='space-y-3'>
          <h2 className='font-medium'>{t('教程正文')}</h2>
          <div className='rounded-lg border p-4'>
            <Markdown>{version.content}</Markdown>
          </div>
        </section>
      )}

      {isCharacterCard && version.normalized_json && (
        <section className='space-y-3'>
          <h2 className='font-medium'>{t('角色卡完整数据')}</h2>
          <pre className='max-h-96 overflow-auto rounded-lg border p-4 text-xs'>
            {(() => {
              try {
                return JSON.stringify(JSON.parse(version.normalized_json), null, 2)
              } catch {
                return version.normalized_json
              }
            })()}
          </pre>
        </section>
      )}
    </main>
  )
}
