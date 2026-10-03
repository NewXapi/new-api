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
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, X } from 'lucide-react'
import * as React from 'react'

import { useRipple } from '@/hooks/use-ripple'
import { cn } from '@/lib/utils'

import { RippleContainer } from './ripple'

const chipVariants = cva(
  'group/chip relative inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-current after:opacity-0 after:content-[""] after:transition-opacity hover:after:opacity-[0.08] focus-visible:after:opacity-[0.1] active:after:opacity-[0.12] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        assist: 'border-border text-foreground',
        filter:
          'border-border text-foreground data-selected:border-transparent data-selected:bg-secondary data-selected:text-secondary-foreground',
        input: 'border-transparent bg-muted text-foreground',
      },
    },
    defaultVariants: {
      variant: 'assist',
    },
  }
)

type ChipProps = React.ComponentProps<'button'> &
  VariantProps<typeof chipVariants> & {
    /** Filter chips: tonal selected state with a leading check icon. */
    selected?: boolean
    /** Input chips: renders a trailing remove affordance. */
    onRemove?: () => void
    leadingIcon?: React.ReactNode
  }

function Chip({
  className,
  variant = 'assist',
  selected = false,
  onRemove,
  leadingIcon,
  children,
  ...props
}: ChipProps) {
  const { onPointerDown, removeRipple, ripples } = useRipple()

  return (
    <button
      type='button'
      data-slot='chip'
      data-variant={variant}
      data-selected={selected || undefined}
      className={cn(chipVariants({ variant }), className)}
      {...props}
      aria-pressed={variant === 'filter' ? selected : undefined}
      onPointerDown={(event) => {
        props.onPointerDown?.(event)
        if (!event.defaultPrevented) onPointerDown(event)
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event)
        if (!event.defaultPrevented && onRemove && (event.key === 'Delete' || event.key === 'Backspace')) {
          event.preventDefault()
          onRemove()
        }
      }}
    >
      <RippleContainer ripples={ripples} onRemove={removeRipple} />
      {variant === 'filter' && selected && <Check aria-hidden='true' />}
      {leadingIcon}
      {children}
      {onRemove && (
        <span
          aria-hidden='true'
          className='-end-1.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-foreground/10'
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <X className='size-3.5!' aria-hidden='true' />
        </span>
      )}
    </button>
  )
}

export { Chip, chipVariants }
export type { ChipProps }
