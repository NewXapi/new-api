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
import { ArrowLeft, Moon, Palette, Sun } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { ConfigDrawer } from '@/components/config-drawer'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/theme-provider'
import { useThemeCustomization } from '@/context/theme-customization-provider'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  const { customization, setPreset } = useThemeCustomization()
  const [configOpen, setConfigOpen] = useState(false)
  const configTriggerRef = useRef<HTMLButtonElement>(null)
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'

  return (
    <div
      data-slot='auth-layout'
      className='auth-scope bg-background relative z-10 grid min-h-svh max-w-none'
    >
      <div className='relative z-10 container mx-auto flex items-center justify-center px-4 py-8 sm:py-12'>
        <div className='mx-auto flex w-full flex-col gap-4 sm:w-[440px]'>
          <div className='auth-card bg-card text-card-foreground ring-foreground/10 relative flex flex-col justify-center rounded-2xl px-6 py-6 shadow-lg ring-1 sm:px-10 sm:py-8'>
            <div className='absolute top-3 right-3 flex items-center gap-1'>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={t(nextTheme === 'dark' ? 'Switch to dark mode' : 'Switch to light mode')}
                onClick={() => {
                  if (customization.preset === 'neutral-gray') setPreset('default')
                  setTheme(nextTheme)
                }}
                className='size-9'
              >
                <span className='relative size-4'>
                  <Moon className='absolute inset-0 size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 motion-reduce:transition-none' aria-hidden='true' />
                  <Sun className='absolute inset-0 size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 motion-reduce:transition-none' aria-hidden='true' />
                </span>
              </Button>
              <Button
                ref={configTriggerRef}
                type='button'
                variant='ghost'
                size='icon'
                className='size-9'
                aria-label={t('Open theme settings')}
                aria-haspopup='dialog'
                aria-expanded={configOpen}
                onClick={() => setConfigOpen(true)}
              >
                <Palette className='size-4' aria-hidden='true' />
              </Button>
            </div>
            {children}
          </div>
          <div className='bg-card/80 text-card-foreground flex flex-wrap items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm'>
            <Link
              to='/'
              className='text-muted-foreground hover:text-primary inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
            >
              <ArrowLeft className='size-4' aria-hidden='true' />
              <span>{t('Back to Home')}</span>
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
      <ConfigDrawer
        open={configOpen}
        onOpenChange={setConfigOpen}
        showTrigger={false}
        finalFocus={configTriggerRef}
      />
    </div>
  )
}
