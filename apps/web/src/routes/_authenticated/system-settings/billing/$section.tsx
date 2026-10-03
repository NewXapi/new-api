import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/billing/$section')({
  beforeLoad: ({ location, params }) => {
    throw redirect({ to: '/admin/system-settings/billing/$section', params: { section: params.section }, search: location.search, hash: location.hash })
  },
})
