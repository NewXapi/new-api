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
import {
  ChartNoAxesCombined,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

const adminItems = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard },
  { label: 'Channels', to: '/admin/channels', icon: ListChecks },
  { label: 'Models', to: '/admin/models', icon: ChartNoAxesCombined },
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'API Keys', to: '/keys/', icon: KeyRound },
  { label: 'System Settings', to: '/admin/system-settings', icon: Settings },
] as const

export function AdminSidebar() {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })

  return (
    <Sidebar collapsible='icon'>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('Administration')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => {
                const isActive =
                  item.to === '/admin'
                    ? pathname === '/admin' || pathname === '/admin/'
                    : pathname === item.to || pathname.startsWith(`${item.to}/`)

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton render={<Link to={item.to} />} isActive={isActive} tooltip={t(item.label)}>
                      <item.icon />
                      <span>{t(item.label)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
