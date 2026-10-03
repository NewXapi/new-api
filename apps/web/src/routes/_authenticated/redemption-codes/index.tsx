import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/redemption-codes/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/redemption-codes', search: location.search, hash: location.hash })
  },
})
