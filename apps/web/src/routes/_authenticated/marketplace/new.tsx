import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TagInput } from '@/components/tag-input'
import { Markdown } from '@/components/ui/markdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

interface ActiveAgreement {
  id: number
  name: string
  version: string
  body: string
  share_ratio: number
}

export const Route = createFileRoute('/_authenticated/marketplace/new')({
  component: ResourceCreatePage,
})

function ResourceCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [type, setType] = useState<'character_card' | 'tutorial'>('tutorial')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [visibility, setVisibility] = useState<'private' | 'shared' | 'public'>('public')
  const [sharedUserIds, setSharedUserIds] = useState('')
  const [price, setPrice] = useState('0')
  const [currency, setCurrency] = useState<'quota' | 'spore'>('quota')
  const [markdown, setMarkdown] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const [agreements, setAgreements] = useState<ActiveAgreement[]>([])
  const [agreementsLoaded, setAgreementsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadAgreements() {
      try {
        const response = await api.get<{ success: boolean; data?: ActiveAgreement[]; message?: string }>(
          '/api/marketplace/user/agreements',
        )
        if (!cancelled && response.data.success) {
          setAgreements(response.data.data ?? [])
        }
      } catch {
        // Agreement load failure surfaces at submit time via accept failures.
      } finally {
        if (!cancelled) setAgreementsLoaded(true)
      }
    }
    void loadAgreements()
    return () => {
      cancelled = true
    }
  }, [])

  async function submit() {
    setBusy(true)
    setError('')
    try {
      // 资源创建与内容提交是两步：创建成功但内容提交失败时，重试只重发
      // 版本（并补齐分享），避免重复创建同名资源。协议接受发生在创建之前，
      // 失败则中止，保证不存在未记录协议的投稿。
      let newId = createdId
      if (!newId) {
        for (const agreement of agreements) {
          const acceptResponse = await api.post<{ success: boolean; message?: string }>(
            `/api/marketplace/user/agreements/${agreement.id}/accept`,
            {},
          )
          if (!acceptResponse.data.success) {
            setError(acceptResponse.data.message ?? t('接受分成协议失败'))
            return
          }
        }

        // 菌种在数据库按 1/10 存储；表单按个输入，提交前换算为内部单位。
        const numericPrice = Number(price)
        const internalPrice =
          numericPrice > 0
            ? currency === 'spore'
              ? Math.round(numericPrice * 10)
              : Math.round(numericPrice)
            : 0
        const createResponse = await api.post<{ success: boolean; data?: { id: number }; message?: string }>(
          '/api/marketplace/user/resources',
          {
            type,
            title,
            summary,
            tags,
            visibility,
            currency: internalPrice > 0 ? currency : 'quota',
            price: internalPrice,
          },
        )
        if (!createResponse.data.success || !createResponse.data.data) {
          setError(createResponse.data.message ?? t('创建失败'))
          return
        }
        newId = createResponse.data.data.id
        setCreatedId(newId)
      }

      if (sharedUserIds.trim() && visibility === 'shared') {
        for (const raw of sharedUserIds.split(/[,\s]+/).filter(Boolean)) {
          await api.post(`/api/marketplace/user/resources/${newId}/share`, { user_id: Number(raw) })
        }
      }

      if (type === 'tutorial') {
        const versionResponse = await api.post<{ success: boolean; message?: string }>(
          `/api/marketplace/user/resources/${newId}/versions`,
          { format: 'tutorial_markdown', content: markdown },
        )
        if (!versionResponse.data.success) {
          setError(versionResponse.data.message ?? t('内容提交失败'))
          return
        }
        setUploaded(true)
      } else if (file) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
          reader.onerror = () => reject(new Error('read failed'))
          reader.readAsDataURL(file)
        })
        const format = file.name.toLowerCase().endsWith('.png') ? 'character_card_png' : 'character_card_json'
        const versionResponse = await api.post<{ success: boolean; message?: string }>(
          `/api/marketplace/user/resources/${newId}/versions`,
          format === 'character_card_png'
            ? { format, data: base64 }
            : { format, content: await file.text() },
        )
        if (!versionResponse.data.success) {
          setError(versionResponse.data.message ?? t('文件提交失败'))
          return
        }
        setUploaded(true)
      }
    } catch {
      setError(t('创建失败'))
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    !busy &&
    title.trim() !== '' &&
    summary.trim() !== '' &&
    agreementsLoaded &&
    (type === 'tutorial' ? markdown.trim() !== '' : file !== null)

  return (
    <main className='mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col space-y-6 overflow-y-auto p-8'>
      <h1 className='text-2xl font-semibold'>{t('发布资源')}</h1>
      {error && <p className='text-destructive'>{error}</p>}
      {createdId && uploaded && (
        <div className='space-y-3 rounded-lg border p-4'>
          <p>{t('资源已提交。公开资源需等待审核通过后上架。')}</p>
          <Button onClick={() => void navigate({ to: '/marketplace-mine' })}>{t('前往我的资源')}</Button>
        </div>
      )}
      {!(createdId && uploaded) && (
        <section className='space-y-4 rounded-lg border p-5'>
          <div className='space-y-1'>
            <Label>{t('类型')}</Label>
            <select className='w-full rounded border bg-background p-2 text-sm' value={type} onChange={(event) => setType(event.target.value as 'character_card' | 'tutorial')}>
              <option value='tutorial'>{t('文字教程')}</option>
              <option value='character_card'>{t('角色卡')}</option>
            </select>
          </div>
          <div className='space-y-1'>
            <Label>{t('标题')}</Label>
            <Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className='space-y-1'>
            <Label>{t('摘要')}</Label>
            <Textarea value={summary} maxLength={4000} rows={2} onChange={(event) => setSummary(event.target.value)} />
          </div>
          <div className='space-y-1'>
            <Label>{t('标签（最多 8 个，回车确认）')}</Label>
            <TagInput value={tags} onChange={setTags} />
          </div>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label>{t('可见范围')}</Label>
              <select className='w-full rounded border bg-background p-2 text-sm' value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'shared' | 'public')}>
                <option value='public'>{t('公开（需审核）')}</option>
                <option value='shared'>{t('指定用户')}</option>
                <option value='private'>{t('仅自己')}</option>
              </select>
            </div>
            <div className='space-y-1'>
              <Label>{t('价格（0 为免费）')}</Label>
              <Input type='number' min={0} step={currency === 'spore' ? 0.1 : 1} value={price} onChange={(event) => setPrice(event.target.value)} />
            </div>
          </div>
          {visibility === 'shared' && (
            <div className='space-y-1'>
              <Label>{t('分享给用户 ID（逗号分隔）')}</Label>
              <Input value={sharedUserIds} onChange={(event) => setSharedUserIds(event.target.value)} />
            </div>
          )}
          {Number(price) > 0 && (
            <div className='space-y-1'>
              <Label>{t('收费币种')}</Label>
              <select className='w-full rounded border bg-background p-2 text-sm' value={currency} onChange={(event) => setCurrency(event.target.value as 'quota' | 'spore')}>
                <option value='quota'>{t('钱包额度')}</option>
                <option value='spore'>{t('菌种')}</option>
              </select>
            </div>
          )}
          {type === 'tutorial' ? (
            <div className='space-y-1'>
              <Label>{t('教程内容（Markdown，禁止图片和 HTML）')}</Label>
              <Textarea className='min-h-64 font-mono text-sm' value={markdown} onChange={(event) => setMarkdown(event.target.value)} />
            </div>
          ) : (
            <div className='space-y-1'>
              <Label>{t('角色卡文件（酒馆 JSON 或 PNG）')}</Label>
              <Input
                type='file'
                accept='.json,.png'
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          )}
          {agreements.length > 0 && (
            <div className='space-y-2'>
              <Label>{t('作者分成协议（提交即视为同意）')}</Label>
              {agreements.map((agreement) => (
                <details className='rounded-lg border p-3' key={agreement.id}>
                  <summary className='cursor-pointer text-sm font-medium'>
                    {agreement.name} · {t('版本')} {agreement.version} · {t('分成')} {agreement.share_ratio / 100}%
                  </summary>
                  <div className='mt-2 max-h-72 overflow-y-auto rounded border p-3'>
                    <Markdown>{agreement.body}</Markdown>
                  </div>
                </details>
              ))}
            </div>
          )}
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? t('提交中…') : t('提交发布')}
          </Button>
        </section>
      )}
    </main>
  )
}
