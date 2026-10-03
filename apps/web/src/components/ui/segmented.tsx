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
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import * as React from 'react'

import { cn } from '@/lib/utils'

type SegmentedOption<Value extends string> = {
  label: React.ReactNode
  value: Value
  icon?: React.ReactNode
  disabled?: boolean
}

type SegmentedProps<Value extends string> = {
  options: SegmentedOption<Value>[]
  value?: Value | null
  onValueChange?: (value: Value) => void
  size?: 'sm' | 'default'
  disabled?: boolean
  className?: string
}

/** MD3 segmented button: pill container, tonal selected segment. */
function Segmented<Value extends string>({
  options,
  value,
  onValueChange,
  size = 'default',
  disabled,
  className,
}: SegmentedProps<Value>) {
  return (
    <ToggleGroupPrimitive
      value={value == null ? undefined : [value]}
      onValueChange={(groupValue) => {
        const next = groupValue.at(-1)
        // Re-clicking the active segment deselects it in base-ui; the MD3
        // single-select pattern keeps a selection mandatory, so ignore it.
        if (next === undefined) {
          return
        }
        onValueChange?.(next as Value)
      }}
      multiple={false}
      disabled={disabled}
      data-slot='segmented'
      data-size={size}
      className={cn(
        'border-border inline-flex items-center overflow-hidden rounded-full border',
        size === 'sm' ? 'h-7' : 'h-9',
        className
      )}
    >
      {options.map((option) => (
        <TogglePrimitive
          key={option.value}
          value={option.value}
          disabled={option.disabled || disabled}
          className={cn(
            'text-foreground/70 hover:text-foreground relative inline-flex flex-1 items-center justify-center gap-1.5 border-l font-medium whitespace-nowrap transition-colors outline-none select-none first:border-l-0 first:rounded-l-full last:rounded-r-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-secondary data-pressed:text-secondary-foreground data-pressed:hover:bg-secondary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-3.5',
            size === 'sm' ? 'h-full px-3 text-xs' : 'h-full px-4 text-sm'
          )}
        >
          {option.icon}
          {option.label}
        </TogglePrimitive>
      ))}
    </ToggleGroupPrimitive>
  )
}

export { Segmented }
export type { SegmentedOption, SegmentedProps }
