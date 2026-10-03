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
import { Link, useLocation } from '@tanstack/react-router'

import { getVisibleAdminNavigation } from '@/components/layout/config/admin-navigation.config'
import { hasPermission } from '@/lib/admin-permissions'
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
import { useAuthStore } from '@/stores/auth-store'

export function AdminSidebar() {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const user = useAuthStore((state) => state.auth.user)
  const visibleItems = getVisibleAdminNavigation(user, hasPermission)

  return (
    <Sidebar collapsible='icon'>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('admin.administration')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive =
                  item.to === '/admin'
                    ? pathname === '/admin' || pathname === '/admin/'
                    : pathname === item.to || pathname.startsWith(`${item.to}/`)

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      render={
                        <Link
                          to={item.to as never}
                          params={item.id === 'models' ? { section: 'metadata' } : undefined}
                        />
                      }
                      isActive={isActive}
                      tooltip={t(item.labelKey)}
                    >
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
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
