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
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { SidebarContent } from '@/components/ui/sidebar'
import { MOTION_TRANSITION, MOTION_VARIANTS } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { type NavGroup } from '../types'
import { NavGroup as NavGroupView } from './nav-group'

type SecondaryPanelProps = {
  group: NavGroup | null
  /** Rail-only (collapsed) mode: panel is not rendered on desktop. */
  hidden: boolean
}

/**
 * Secondary panel — second column of the dual-sidebar.
 *
 * Shows the active section's title and its navigation items, rendered
 * flat through the shared NavGroup renderer (links, expanded section
 * groups and dynamic chat presets all render without accordions).
 */
export function SecondaryPanel({ group, hidden }: SecondaryPanelProps) {
  const shouldReduce = useReducedMotion()

  if (!group) return null

  return (
    <section
      data-slot='sidebar-panel'
      aria-label={group.title}
      className={cn(
        'flex h-full min-w-0 flex-1 flex-col border-s border-sidebar-border/50',
        hidden && 'hidden'
      )}
    >
      <div className='px-4 pt-4 pb-1'>
        <div className='truncate text-sm font-semibold tracking-wide text-sidebar-foreground'>
          {group.title}
        </div>
      </div>

      <SidebarContent className='py-1'>
        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={group.id ?? group.title}
            initial={
              shouldReduce ? false : MOTION_VARIANTS.sidebarSlide.initial
            }
            animate={MOTION_VARIANTS.sidebarSlide.animate}
            exit={shouldReduce ? undefined : MOTION_VARIANTS.sidebarSlide.exit}
            transition={MOTION_TRANSITION.fast}
            className='flex flex-col'
          >
            <NavGroupView {...group} title='' />
          </motion.div>
        </AnimatePresence>
      </SidebarContent>
    </section>
  )
}
