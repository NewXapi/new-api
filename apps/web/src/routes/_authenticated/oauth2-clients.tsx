import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { api } from '@/lib/api'

interface OAuthClient {
  id: number
  client_id: string
  name: string
  client_type: string
  redirect_uris?: string
  scopes?: string
  enabled: boolean
}

type ClientActionResponse = { success: boolean; data?: { client_secret?: string }; message?: string }

export const Route = createFileRoute('/_authenticated/oauth2-clients')({
  component: OAuthClientsPage,
})

function OAuthClientsPage() {
  const [clients, setClients] = useState<OAuthClient[]>([])
  const [error, setError] = useState('')
  const [createdSecret, setCreatedSecret] = useState('')
  const [rotatedSecret, setRotatedSecret] = useState('')
  const [name, setName] = useState('')
  const [redirectURI, setRedirectURI] = useState('')

  async function load() {
    try {
      const response = await api.get<{ success: boolean; data?: OAuthClient[]; message?: string }>('/api/oauth2/admin/clients')
      if (response.data.success) setClients(response.data.data ?? [])
      else setError(response.data.message ?? 'Unable to load OAuth clients')
    } catch { setError('Unable to load OAuth clients') }
  }

  useEffect(() => { void load() }, [])

  async function createClient() {
    setCreatedSecret('')
    try {
      const response = await api.post<{ success: boolean; data?: { client: OAuthClient; client_secret?: string }; message?: string }>('/api/oauth2/admin/clients', {
        name,
        client_type: 'confidential',
        redirect_uris: [redirectURI],
        scopes: ['openid', 'profile', 'email'],
      })
      if (!response.data.success || !response.data.data) { setError(response.data.message ?? 'Unable to create client'); return }
      setCreatedSecret(response.data.data.client_secret ?? '')
      setName('')
      setRedirectURI('')
      await load()
    } catch { setError('Unable to create client') }
  }

  async function setClientEnabled(clientID: string, enabled: boolean) {
    setError('')
    try {
      const response = await api.post<ClientActionResponse>(`/api/oauth2/admin/clients/${encodeURIComponent(clientID)}/${enabled ? 'enable' : 'disable'}`)
      if (!response.data.success) { setError(response.data.message ?? 'Unable to update client'); return }
      if (!enabled) setRotatedSecret('')
      await load()
    } catch { setError('Unable to update client') }
  }

  async function rotateSecret(clientID: string) {
    setError('')
    setRotatedSecret('')
    try {
      const response = await api.post<ClientActionResponse>(`/api/oauth2/admin/clients/${encodeURIComponent(clientID)}/secret`)
      if (!response.data.success) { setError(response.data.message ?? 'Unable to rotate secret'); return }
      setRotatedSecret(response.data.data?.client_secret ?? '')
    } catch { setError('Unable to rotate secret') }
  }

  return (
    <main className='mx-auto max-w-4xl space-y-8 p-8'>
      <header>
        <h1 className='text-2xl font-semibold'>OAuth Clients</h1>
        <p className='text-muted-foreground mt-2 text-sm'>Register external websites that may use New API as their login provider.</p>
      </header>
      {error && <p className='text-destructive'>{error}</p>}
      <section className='space-y-3 rounded-lg border p-5'>
        <h2 className='font-medium'>Register client</h2>
        <input className='w-full rounded border p-2' placeholder='Application name' value={name} onChange={(event) => setName(event.target.value)} />
        <input className='w-full rounded border p-2' placeholder='Exact HTTPS redirect URI' value={redirectURI} onChange={(event) => setRedirectURI(event.target.value)} />
        <button className='bg-primary text-primary-foreground rounded px-4 py-2' disabled={!name || !redirectURI} onClick={() => void createClient()}>Create client</button>
        {createdSecret && <p className='rounded border p-3 text-sm'>Client secret, shown once: <code>{createdSecret}</code></p>}
        {rotatedSecret && <p className='rounded border p-3 text-sm'>New client secret, shown once: <code>{rotatedSecret}</code></p>}
      </section>
      <section className='space-y-3'>
        {clients.map((client) => (
          <article className='rounded-lg border p-4' key={client.client_id}>
            <strong>{client.name}</strong>
            <p className='text-muted-foreground text-sm'>{client.client_id} · {client.client_type} · {client.enabled ? 'enabled' : 'disabled'}</p>
            <div className='mt-2 flex gap-2'>
              {client.enabled
                ? <button className='rounded border px-3 py-1 text-sm' onClick={() => void setClientEnabled(client.client_id, false)}>Disable</button>
                : <button className='rounded border px-3 py-1 text-sm' onClick={() => void setClientEnabled(client.client_id, true)}>Enable</button>}
              {client.client_type === 'confidential' && (
                <button className='rounded border px-3 py-1 text-sm' onClick={() => void rotateSecret(client.client_id)}>Rotate secret</button>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
