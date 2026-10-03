import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings', search: location.search, hash: location.hash })
  },
})
