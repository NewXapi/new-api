import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/models/$section')({
  beforeLoad: ({ location, params }) => {
    throw redirect({
      to: '/admin/models/$section',
      params: { section: params.section },
      search: location.search,
      hash: location.hash,
    })
  },
})
