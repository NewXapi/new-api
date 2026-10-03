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
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PanelWrapperProps {
  title: ReactNode
  description?: ReactNode
  loading?: boolean
  empty?: boolean
  emptyMessage?: string
  height?: string
  className?: string
  contentClassName?: string
  headerActions?: ReactNode
  children?: ReactNode
}

function PanelHeader(props: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  const heading = (
    <div className='min-w-0 flex-1 space-y-1 break-words'>
      <div className='text-sm font-semibold'>{props.title}</div>
      {props.description != null && (
        <div className='text-muted-foreground text-xs'>{props.description}</div>
      )}
    </div>
  )

  return (
    <CardHeader className='border-b p-4 sm:px-5'>
      {props.actions != null ? (
        <div className='flex min-w-0 flex-wrap items-start justify-between gap-3'>
          {heading}
          <div className='flex max-w-full flex-wrap items-center gap-2'>
            {props.actions}
          </div>
        </div>
      ) : (
        heading
      )}
    </CardHeader>
  )
}

export function PanelWrapper(props: PanelWrapperProps) {
  const { t } = useTranslation()
  const resolvedEmptyMessage = props.emptyMessage ?? t('No data available')
  const height = props.height ?? 'h-64'
  const frameClassName = cn('min-w-0 gap-0 py-0', props.className)

  if (props.loading) {
    return (
      <Card className={frameClassName}>
        <PanelHeader title={props.title} description={props.description} />
        <CardContent className={cn('p-4 sm:p-5', props.contentClassName)}>
          <Skeleton className={`w-full ${height}`} />
        </CardContent>
      </Card>
    )
  }

  if (props.empty) {
    return (
      <Card className={frameClassName}>
        <PanelHeader title={props.title} description={props.description} />
        <CardContent
          className={cn(
            'text-muted-foreground flex items-center justify-center px-4 text-sm',
            height,
            props.contentClassName
          )}
        >
          {resolvedEmptyMessage}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={frameClassName}>
      <PanelHeader
        title={props.title}
        description={props.description}
        actions={props.headerActions}
      />
      <CardContent className={cn('p-4 sm:p-5', props.contentClassName)}>
        {props.children}
      </CardContent>
    </Card>
  )
}
