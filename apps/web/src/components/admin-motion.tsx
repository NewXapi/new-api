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
import type { ReactNode } from 'react'

import { MOTION_TRANSITION, MOTION_VARIANTS } from '@/lib/motion'

interface AdminMenuTransitionProps {
  children: ReactNode
  menuKey: string
  className?: string
}

export function AdminMenuTransition(props: AdminMenuTransitionProps) {
  const shouldReduce = useReducedMotion()

  return (
    <AnimatePresence mode='wait' initial={false}>
      <motion.div
        key={props.menuKey}
        initial={shouldReduce ? false : MOTION_VARIANTS.adminMenu.initial}
        animate={MOTION_VARIANTS.adminMenu.animate}
        exit={shouldReduce ? undefined : MOTION_VARIANTS.adminMenu.exit}
        transition={MOTION_TRANSITION.fast}
        className={props.className}
      >
        {props.children}
      </motion.div>
    </AnimatePresence>
  )
}

interface AdminStatusIconProps {
  children: ReactNode
  className?: string
}

export function AdminStatusIcon(props: AdminStatusIconProps) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <span className={props.className}>{props.children}</span>
  }

  return (
    <motion.span
      initial={MOTION_VARIANTS.adminStatus.initial}
      animate={MOTION_VARIANTS.adminStatus.animate}
      transition={MOTION_TRANSITION.fast}
      className={props.className}
    >
      {props.children}
    </motion.span>
  )
}
