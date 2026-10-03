import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/subscriptions/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/subscriptions', search: location.search, hash: location.hash })
  },
})
