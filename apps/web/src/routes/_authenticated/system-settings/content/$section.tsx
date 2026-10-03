import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/system-settings/content/$section')({
  beforeLoad: ({ location, params }) => {
    throw redirect({ to: '/admin/system-settings/content/$section', params: { section: params.section }, search: location.search, hash: location.hash })
  },
})
