import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/models/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings/models', search: location.search, hash: location.hash })
  },
})
