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
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ProfileDropdown } from '@/components/profile-dropdown'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Header } from './header'
import { SystemBrand } from './system-brand'

export function AdminHeader() {
  const { t } = useTranslation()

  return (
    <Header>
      <div className='flex items-center gap-2'>
        <ProfileDropdown />
        <SystemBrand variant='inline' />
      </div>
      <div className='ms-auto flex items-center gap-2'>
        <Button render={<Link to='/dashboard' />} variant='ghost' size='sm'>
          <ArrowLeft />
          {t('admin.header.backToUserApp')}
        </Button>
      </div>
    </Header>
  )
}
