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
  Activity,
  FileText,
  FlaskConical,
  Key,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Store,
  User,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ADMIN_NAVIGATION } from '@/components/layout/config/admin-navigation.config'
import { type SidebarData } from '@/components/layout/types'
import { useStatus } from '@/hooks/use-status'
import { useWalletBalance } from '@/hooks/use-wallet-balance'
import { isPricingModuleEnabled } from '@/lib/nav-modules'

/**
 * Root navigation groups for the application sidebar.
 *
 * The `admin` group is shown under the Admin workspace Tab; all other
 * groups belong to the User workspace Tab (see `app-sidebar.tsx`).
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const { status } = useStatus()
  const pricingEnabled = isPricingModuleEnabled(status)
  const walletBalance = useWalletBalance()

  return {
    navGroups: [
      {
        id: 'chat',
        title: t('Chat'),
        items: [
          {
            title: t('Playground'),
            url: '/playground',
            icon: FlaskConical,
          },
          {
            title: t('Chat'),
            icon: MessageSquare,
            type: 'chat-presets',
          },
        ],
      },
      {
        id: 'general',
        title: t('General'),
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: LayoutDashboard,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Usage Logs'),
            url: '/usage-logs/common',
            icon: FileText,
          },
          {
            title: t('Task Logs'),
            url: '/usage-logs/task',
            activeUrls: ['/usage-logs/drawing'],
            configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            icon: ListTodo,
          },
          ...(pricingEnabled
            ? [
                {
                  title: t('Model Square'),
                  url: '/pricing',
                  icon: Store,
                },
              ]
            : []),
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
            badge: walletBalance ?? undefined,
          },
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: ADMIN_NAVIGATION.map((item) => ({
          title: t(item.labelKey),
          url: item.to,
          icon: item.icon,
          requiredRole: item.requiredRole,
        })),
      },
    ],
  }
}