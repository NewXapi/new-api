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
import { Link, useLocation } from '@tanstack/react-router'
import { type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

import { checkIsActive } from '../lib/url-utils'
import {
  type NavCollapsible,
  type NavChatPresets,
  type NavLink,
  type NavGroup as NavGroupProps,
} from '../types'
import { ChatPresetsItem } from './chat-presets-item'

/**
 * Sidebar navigation group component.
 *
 * Flat layout: plain links render as a single menu block, and collapsible
 * sections are expanded in place — an uppercase group label followed by all
 * of its links, never an accordion.
 */
export function NavGroup({ title, items }: NavGroupProps) {
  const href = useLocation({ select: (location) => location.href })

  type Block =
    | { kind: 'links'; key: string; items: NavLink[] }
    | { kind: 'presets'; key: string; item: NavChatPresets }
    | { kind: 'section'; key: string; item: NavCollapsible }

  const blocks: Block[] = []
  for (const item of items) {
    const key = `${item.title}-${item.url || item.type}`
    if (item.type === 'chat-presets') {
      blocks.push({ kind: 'presets', key, item: item as NavChatPresets })
    } else if (item.items) {
      blocks.push({ kind: 'section', key, item: item as NavCollapsible })
    } else {
      const last = blocks[blocks.length - 1]
      const link = item as NavLink
      if (last?.kind === 'links') last.items.push(link)
      else blocks.push({ kind: 'links', key, items: [link] })
    }
  }

  return (
    <SidebarGroup className='px-2 py-1'>
      {title ? (
        <SidebarGroupLabel className='text-muted-foreground/70 px-2 text-[11px] font-medium tracking-wider uppercase'>
          {title}
        </SidebarGroupLabel>
      ) : null}
      {blocks.map((block) => {
        if (block.kind === 'links') {
          return (
            <SidebarMenu key={block.key}>
              {block.items.map((item) => (
                <SidebarMenuLink
                  key={`${item.title}-${item.url}`}
                  item={item}
                  href={href}
                />
              ))}
            </SidebarMenu>
          )
        }
        if (block.kind === 'presets') {
          return (
            <SidebarMenu key={block.key}>
              <ChatPresetsItem item={block.item} />
            </SidebarMenu>
          )
        }
        return (
          <div key={block.key} className='contents'>
            <SidebarGroupLabel className='text-muted-foreground/70 px-2 pt-3 text-[11px] font-medium tracking-wider uppercase'>
              {block.item.title}
            </SidebarGroupLabel>
            <SidebarMenu>
              {block.item.items.map((sub) => (
                <SidebarMenuLink
                  key={`${sub.title}-${sub.url}`}
                  item={sub as NavLink}
                  href={href}
                />
              ))}
            </SidebarMenu>
          </div>
        )
      })}
    </SidebarGroup>
  )
}

/**
 * Navigation badge component
 */
function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className='shrink-0 px-1 py-0 text-xs'>{children}</Badge>
}

/**
 * Sidebar menu link item
 */
function SidebarMenuLink({ item, href }: { item: NavLink; href: string }) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
        render={<Link to={item.url} onClick={() => setOpenMobile(false)} />}
      >
        {item.icon && <item.icon className='shrink-0' />}
        <span className='min-w-0 flex-1 truncate'>{item.title}</span>
        {item.badge && <NavBadge>{item.badge}</NavBadge>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
