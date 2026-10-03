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
import type { Ripple } from '@/hooks/use-ripple'

/**
 * Renders the active MD3 ripple waves inside a pressable host. The host
 * must be `relative` (anchor) and the waves are clipped to its radius.
 * Wave color follows the host's `currentColor`.
 */
export function RippleContainer({
  ripples,
  onRemove,
}: {
  ripples: Ripple[]
  onRemove: (id: number) => void
}) {
  return (
    <span
      aria-hidden='true'
      className='pointer-events-none absolute inset-0 isolate overflow-hidden rounded-[inherit]'
    >
      {ripples.map((wave) => (
        <span
          key={wave.id}
          style={{
            height: wave.size,
            left: wave.x,
            top: wave.y,
            width: wave.size,
          }}
          className='bg-current md-ripple-wave absolute rounded-full'
          onAnimationEnd={() => onRemove(wave.id)}
        />
      ))}
    </span>
  )
}
