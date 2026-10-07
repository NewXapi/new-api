import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

interface ConsentData {
  id: string
  client_name: string
  client_id: string
  scope: string[]
  redirect_uri: string
}

export const Route = createFileRoute('/oauth2/consent')({
  validateSearch: (search: Record<string, unknown>) => ({
    request: typeof search.request === 'string' ? search.request : '',
  }),
  beforeLoad: ({ search, location }) => {
    const auth = useAuthStore.getState().auth
    if (!auth.user || !auth.accessToken) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
    if (!search.request) throw new Error('Missing OAuth consent request')
  },
  component: OAuthConsentPage,
})

function OAuthConsentPage() {
  const { t } = useTranslation()
  const { request } = Route.useSearch()
  const [consent, setConsent] = useState<ConsentData | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    api.get<{ success: boolean; data?: ConsentData; message?: string }>(
      `/api/oauth2/consent/?request=${encodeURIComponent(request)}`
    ).then((response) => {
      if (!active) return
      if (response.data.success && response.data.data) setConsent(response.data.data)
      else setError(response.data.message || t('Unable to load authorization request'))
    }).catch(() => {
      if (active) setError(t('Unable to load authorization request'))
    })
    return () => { active = false }
  }, [request, t])

  async function finish(approve: boolean) {
    setSubmitting(true)
    try {
      const response = await api.post<{ success: boolean; data?: { redirect_uri?: string }; message?: string }>(
        `/api/oauth2/consent/?request=${encodeURIComponent(request)}&approve=${approve ? 'true' : 'false'}`,
        {},
      )
      const target = response.data.data?.redirect_uri
      if (target) window.location.assign(target)
      else setError(response.data.message || t('Authorization was not completed'))
    } catch {
      setError(t('Authorization was not completed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (error) return <main className='mx-auto max-w-lg p-8'><h1 className='text-xl font-semibold'>{t('Authorization failed')}</h1><p className='mt-3'>{error}</p></main>
  if (!consent) return <main className='mx-auto max-w-lg p-8'>{t('Loading authorization request...')}</main>

  return (
    <main className='mx-auto mt-12 max-w-lg space-y-6 rounded-lg border p-8'>
      <div>
        <h1 className='text-2xl font-semibold'>{t('Authorize {{client}}', { client: consent.client_name })}</h1>
        <p className='text-muted-foreground mt-2 text-sm'>{t('This application is requesting access to your New API account.')}</p>
      </div>
      <ul className='space-y-2 text-sm'>
        {consent.scope.map((scope) => <li key={scope} className='rounded border px-3 py-2'>{scope}</li>)}
      </ul>
      <div className='flex gap-3'>
        <button className='border px-4 py-2' disabled={submitting} onClick={() => void finish(false)}>{t('Deny')}</button>
        <button className='bg-primary text-primary-foreground px-4 py-2' disabled={submitting} onClick={() => void finish(true)}>{t('Allow')}</button>
      </div>
    </main>
  )
}
