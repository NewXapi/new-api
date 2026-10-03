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
import { useCallback, useEffect, useRef, useState } from 'react'

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
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (
        event.button !== 0 ||
        event.currentTarget.matches(':disabled, [aria-disabled="true"]') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return
      }
      const el = event.currentTarget
      const rect = el.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const size = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y)) * 2
      const id = nextId.current++
      // 动画被取消时也清理波纹，避免依赖 animationend 导致残留。
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id)
        setRipples((waves) => waves.filter((wave) => wave.id !== id))
      }, 700))
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
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setRipples((waves) => waves.some((wave) => wave.id === id)
      ? waves.filter((wave) => wave.id !== id)
      : waves)
  }, [])

  return { onPointerDown, removeRipple, ripples }
}
