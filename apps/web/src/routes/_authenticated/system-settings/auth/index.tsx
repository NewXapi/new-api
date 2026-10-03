import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/auth/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings/auth', search: location.search, hash: location.hash })
  },
})
