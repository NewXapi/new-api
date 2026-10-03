import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/operations/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings/operations', search: location.search, hash: location.hash })
  },
})
