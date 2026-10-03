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
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

import { loadRandomBackground } from './lib/dynamic-background'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()
  const scopeRef = useRef<HTMLDivElement>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) return
    return loadRandomBackground(scope, setBackgroundUrl)
  }, [])

  return (
    <div
      ref={scopeRef}
      className='auth-scope bg-background relative grid min-h-svh max-w-none'
    >
      {backgroundUrl && (
        <>
          <img
            src={backgroundUrl}
            alt=''
            aria-hidden='true'
            className='auth-background absolute inset-0 size-full object-cover'
          />
          {/* 暗色模式下叠加半透明黑层，压暗背景图降低刺眼感 */}
          <div aria-hidden='true' className='absolute inset-0 dark:bg-black/45' />
        </>
      )}
      <Link
        to='/'
        className='absolute top-4 left-4 z-10 flex items-center gap-2 transition-opacity hover:opacity-80 sm:top-8 sm:left-8'
      >
        <div className='relative h-8 w-8'>
          {loading ? (
            <Skeleton className='absolute inset-0 rounded-full' />
          ) : (
            <img
              src={logo}
              alt={t('Logo')}
              className='h-8 w-8 rounded-full object-cover'
            />
          )}
        </div>
        {loading ? (
          <Skeleton className='h-6 w-24' />
        ) : (
          <h1 className='text-xl font-medium'>{systemName}</h1>
        )}
      </Link>
      <div className='relative z-10 container mx-auto flex items-center justify-center px-4 pt-20 pb-8 sm:py-20'>
        <div className='auth-card bg-card text-card-foreground ring-foreground/10 mx-auto flex w-full flex-col justify-center space-y-2 rounded-lg px-6 py-8 shadow-lg ring-1 sm:w-[440px] sm:px-10 sm:py-10'>
          {children}
        </div>
      </div>
    </div>
  )
}
