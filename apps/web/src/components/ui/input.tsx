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
import { Input as InputPrimitive } from '@base-ui/react/input'
import * as React from 'react'

import { cn } from '@/lib/utils'

type InputProps = React.ComponentProps<'input'> & {
  /** MD3 leading icon rendered inside the field's start edge. */
  leadingIcon?: React.ReactNode
  /** MD3 trailing icon rendered inside the field's end edge. */
  trailingIcon?: React.ReactNode
  /** `filled` renders the MD3 tonal (surface-container) text field. */
  variant?: 'outlined' | 'filled'
}

function Input({
  className,
  type,
  leadingIcon,
  trailingIcon,
  variant = 'outlined',
  ...props
}: InputProps) {
  const field = (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 focus-visible:ring-inset disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-inset md:text-sm',
        variant === 'outlined'
          ? 'border-input bg-transparent dark:bg-input/30 dark:disabled:bg-input/80'
          : 'border-transparent bg-muted focus-visible:border-transparent dark:bg-input/50',
        leadingIcon && 'ps-9',
        trailingIcon && 'pe-9',
        className
      )}
      {...props}
    />
  )

  if (!leadingIcon && !trailingIcon) {
    return field
  }

  return (
    <div className='relative w-full min-w-0'>
      {leadingIcon && (
        <span className='text-muted-foreground pointer-events-none absolute start-3 top-1/2 z-10 -translate-y-1/2 [&_svg]:size-4'>
          {leadingIcon}
        </span>
      )}
      {field}
      {trailingIcon && (
        <span className='text-muted-foreground pointer-events-none absolute end-3 top-1/2 z-10 -translate-y-1/2 [&_svg]:size-4'>
          {trailingIcon}
        </span>
      )}
    </div>
  )
}

export { Input }
export type { InputProps }
