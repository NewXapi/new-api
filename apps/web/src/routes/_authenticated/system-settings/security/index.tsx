import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/security/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings/security', search: location.search, hash: location.hash })
  },
})
