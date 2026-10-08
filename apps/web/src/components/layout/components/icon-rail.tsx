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
import { useTranslation } from 'react-i18next'

import { useSidebar } from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { type NavGroup } from '../types'

type IconRailProps = {
  groups: NavGroup[]
  activeGroupId: string | null
  onSelect: (groupId: string) => void
}

/**
 * Icon rail — first column of the dual-sidebar.
 *
 * One icon button per navigation section (nav group). Clicking an icon
 * previews that section in the secondary panel; in collapsed (rail-only)
 * mode it also expands the panel.
 */
export function IconRail({
  groups,
  activeGroupId,
  onSelect,
}: IconRailProps) {
  const { t } = useTranslation()
  const { state, isMobile, setOpen } = useSidebar()
  const collapsed = state === 'collapsed' && !isMobile

  return (
    <nav
      data-slot='icon-rail'
      aria-label={t('Primary navigation')}
      className={cn(
        'flex h-full w-16 shrink-0 flex-col items-center gap-1 py-3',
        'group-data-[collapsible=icon]:w-full'
      )}
    >
      <div className='flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto'>
        {groups.map((group) => {
          const icon = group.icon
          if (!icon || !group.id) return null
          const Icon = icon
          const active = group.id === activeGroupId
          return (
            <TooltipProvider key={group.id} delay={0}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type='button'
                      data-sidebar='rail-item'
                      data-section={group.id}
                      data-active={active}
                      aria-label={group.title}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        onSelect(group.id)
                        if (collapsed) setOpen(true)
                      }}
                      className={cn(
                        'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl outline-none transition-colors',
                        'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon className='size-5' />
                    </button>
                  }
                />
                <TooltipContent side='right' align='center'>
                  {group.title}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        })}
      </div>

    </nav>
  )
}
