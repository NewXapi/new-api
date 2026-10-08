/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef, useState } from 'react'

import { loadRandomBackground } from '@/features/auth/lib/dynamic-background'

/** One root-owned background, independent of the active route and theme preset. */
export function AppBackground() {
  const imageHostRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const host = imageHostRef.current
    if (!host) return
    const body = document.body
    const cleanup = loadRandomBackground(body, (_url, image) => {
      image.alt = ''
      image.dataset.appBackgroundImage = 'true'
      image.className = 'auth-background size-full object-cover'
      host.replaceChildren(image)
      body.setAttribute('data-app-background', 'true')
      setLoaded(true)
    }, false)
    return () => {
      cleanup()
      host.replaceChildren()
      body.removeAttribute('data-app-background')
    }
  }, [])

  return (
    <div
      hidden={!loaded}
      aria-hidden='true'
      data-slot='app-background'
      className='pointer-events-none fixed inset-0 z-0'
    >
      <div ref={imageHostRef} className='absolute inset-0' />
      <div
        data-slot='app-background-scrim'
        className='absolute inset-0'
        style={{ backgroundColor: 'var(--app-background-scrim)' }}
      />
    </div>
  )
}
