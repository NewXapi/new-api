import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/content/')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/admin/system-settings/content', search: location.search, hash: location.hash })
  },
})
