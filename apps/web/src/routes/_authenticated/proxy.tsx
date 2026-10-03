import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/proxy')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/proxy', search: location.search, hash: location.hash })
  },
})
