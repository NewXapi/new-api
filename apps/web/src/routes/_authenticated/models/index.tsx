import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/models/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/models/metadata', search: location.search, hash: location.hash })
  },
})
