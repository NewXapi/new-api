import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/user-insights/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/user-insights', search: location.search, hash: location.hash })
  },
})
