import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/models/$section')({
  beforeLoad: ({ location, params }) => {
    throw redirect({ to: '/admin/system-settings/models/$section', params: { section: params.section }, search: location.search, hash: location.hash })
  },
})
