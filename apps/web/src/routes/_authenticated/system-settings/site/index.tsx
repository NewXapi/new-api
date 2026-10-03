import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/site/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings/site', search: location.search, hash: location.hash })
  },
})
