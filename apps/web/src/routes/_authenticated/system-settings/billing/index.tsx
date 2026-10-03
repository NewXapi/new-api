import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/billing/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings/billing', search: location.search, hash: location.hash })
  },
})
