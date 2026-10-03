import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/users/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/users', search: location.search, hash: location.hash })
  },
})
