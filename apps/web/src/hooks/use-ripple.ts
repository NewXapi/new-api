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
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'

export type Ripple = {
  id: number
  x: number
  y: number
  size: number
}

/**
 * Material Design 3 touch ripple state. Spread `onPointerDown` onto the
 * host element (which must be `relative overflow-hidden`) and render
 * `<RippleContainer ripples={ripples} onRemove={removeRipple} />` inside
 * it; waves are tinted with the host's `currentColor`.
 */
export function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const nextId = useRef(0)

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const el = event.currentTarget
      const rect = el.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height) * 2
      const id = nextId.current++
      setRipples((waves) => [
        ...waves,
        {
          id,
          size,
          x: event.clientX - rect.left - size / 2,
          y: event.clientY - rect.top - size / 2,
        },
      ])
    },
    []
  )

  const removeRipple = useCallback((id: number) => {
    setRipples((waves) => waves.filter((wave) => wave.id !== id))
  }, [])

  return { onPointerDown, removeRipple, ripples }
}
