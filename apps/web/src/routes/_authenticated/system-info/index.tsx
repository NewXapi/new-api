import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-info/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-info', search: location.search, hash: location.hash })
  },
})
