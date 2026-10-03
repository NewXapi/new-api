import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Gauge,
  RadioTower,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getFlowQuotaDates, getUserQuotaDates } from '@/features/dashboard/api'
import { buildQueryParams } from '@/features/dashboard/lib'
import type { FlowQuotaDataItem, QuotaDataItem } from '@/features/dashboard/types'
import { getPerfMetrics, getPerfMetricsSummary } from '@/features/performance-metrics/api'
import type { PerfModelSummary, PerformanceSeriesPoint } from '@/features/performance-metrics/types'
import { formatCompactNumber, formatNumber, formatPercent, formatQuota } from '@/lib/format'
import { computeTimeRange } from '@/lib/time'

const WINDOW_HOURS = 24
const WINDOW_DAYS = 1

type Metric = {
  label: string
  value: string
  unit: string
  icon: LucideIcon
  tone: IconBadgeTone
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildTrendSpec(series: PerformanceSeriesPoint[], label: string) {
  return {
    type: 'line',
    data: [{
      id: 'performance',
      values: series.map((point) => ({
        time: new Date(point.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: point.success_rate,
      })),
    }],
    xField: 'time',
    yField: 'value',
    axes: {
      x: { visible: true, label: { style: { fontSize: 10 } } },
      y: { visible: true, label: { style: { fontSize: 10 } }, title: { visible: true, text: '%' } },
    },
    legends: { visible: false },
    point: { visible: false },
    line: { style: { curveType: 'monotone', lineWidth: 2 } },
    title: { visible: false, text: label },
    padding: { top: 8, right: 16, bottom: 24, left: 38 },
  }
}

function StateMessage({ error, empty }: { error?: boolean; empty?: boolean }) {
  const { t } = useTranslation()
  if (error) return <p className='text-muted-foreground p-4 text-sm'>{t('Unable to load this data.')}</p>
  if (empty) {
    return (
      <Empty className='min-h-32 border-0'>
        <EmptyHeader>
          <EmptyTitle>{t('No data available')}</EmptyTitle>
          <EmptyDescription>{t('There is no activity in this period.')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return null
}

function MetricCard({ metric, loading }: { metric: Metric; loading: boolean }) {
  const Icon = metric.icon
  return (
    <Card className='min-w-0 gap-2 py-3'>
      <CardContent className='px-3 sm:px-4'>
        <div className='flex items-center gap-2'>
          <IconBadge tone={metric.tone} size='sm'><Icon /></IconBadge>
          <span className='text-muted-foreground truncate text-xs font-medium'>{metric.label}</span>
        </div>
        {loading ? (
          <Skeleton className='mt-3 h-7 w-24' />
        ) : (
          <div className='mt-2 truncate font-mono text-xl font-semibold tabular-nums' title={`${metric.value} ${metric.unit}`}>
            {metric.value} <span className='text-muted-foreground text-xs font-normal'>{metric.unit}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Card className='min-w-0 gap-0 py-0'>
      <CardHeader className='border-b px-4 py-3'>
        <CardTitle className='flex items-center gap-2 text-sm'><IconBadge tone='info' size='sm'><Icon /></IconBadge>{title}</CardTitle>
      </CardHeader>
      <CardContent className='p-0'>{children}</CardContent>
    </Card>
  )
}

function AdminDashboard() {
  const { t } = useTranslation()
  const range = useMemo(() => computeTimeRange(WINDOW_DAYS), [])
  const params = useMemo(() => buildQueryParams(range), [range])

  const usageQuery = useQuery({
    queryKey: ['admin-dashboard', 'usage', range.start_timestamp, range.end_timestamp],
    queryFn: () => getUserQuotaDates(params, true),
    staleTime: 60_000,
  })
  const flowQuery = useQuery({
    queryKey: ['admin-dashboard', 'flow', range.start_timestamp, range.end_timestamp],
    queryFn: () => getFlowQuotaDates(params, true),
    staleTime: 60_000,
  })
  const performanceQuery = useQuery({
    queryKey: ['admin-dashboard', 'performance', WINDOW_HOURS],
    queryFn: () => getPerfMetricsSummary(WINDOW_HOURS),
    staleTime: 60_000,
    retry: false,
  })

  const usage = usageQuery.data?.data ?? []
  const flow = flowQuery.data?.data ?? []
  const models = performanceQuery.data?.data.models ?? []
  const topModel = models[0]?.model_name ?? ''
  const trendQuery = useQuery({
    queryKey: ['admin-dashboard', 'trend', topModel, WINDOW_HOURS],
    queryFn: () => getPerfMetrics(topModel, WINDOW_HOURS),
    enabled: Boolean(topModel),
    staleTime: 60_000,
    retry: false,
  })

  const totals = useMemo(() => usage.reduce((result, item: QuotaDataItem) => {
    result.requests += numberValue(item.count)
    result.consumption += numberValue(item.quota_display)
    result.tokens += numberValue(item.token_used)
    if (item.user_id || item.username) result.users.add(item.user_id ?? item.username)
    return result
  }, { requests: 0, consumption: 0, tokens: 0, users: new Set<number | string>() }), [usage])

  const channels = useMemo(() => {
    const byChannel = new Map<string, { requests: number; consumption: number }>()
    for (const item of flow as FlowQuotaDataItem[]) {
      const name = item.channel_name || (item.channel_id ? `Channel ${item.channel_id}` : t('Unknown channel'))
      const current = byChannel.get(name) ?? { requests: 0, consumption: 0 }
      current.requests += numberValue(item.count)
      current.consumption += numberValue(item.quota_display)
      byChannel.set(name, current)
    }
    return [...byChannel.entries()].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.requests - a.requests).slice(0, 6)
  }, [flow, t])

  const metrics: Metric[] = [
    { label: t('Platform requests'), value: formatCompactNumber(totals.requests), unit: t('requests'), icon: Activity, tone: 'info' },
    { label: t('Consumption'), value: formatQuota(totals.consumption), unit: t('quota'), icon: BarChart3, tone: 'warning' },
    { label: t('Active users'), value: formatNumber(totals.users.size), unit: t('users'), icon: Users, tone: 'success' },
    { label: t('Success rate'), value: formatPercent(models.length ? models.reduce((sum, model) => sum + numberValue(model.success_rate), 0) / models.length : Number.NaN), unit: '', icon: CheckCircle2, tone: 'success' },
  ]

  const anomalyModels = models.filter((model: PerfModelSummary) => model.success_rate < 95 || model.avg_latency_ms > 2000).slice(0, 5)
  const hasUsageError = usageQuery.isError
  const hasFlowError = flowQuery.isError
  const hasPerformanceError = performanceQuery.isError
  const usageLoading = usageQuery.isLoading

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('Admin dashboard')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{t('Platform-wide operations overview for the last 24 hours.')}</p>
      </div>

      <div className='grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4'>
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} loading={usageLoading || (metric.label === t('Success rate') && performanceQuery.isLoading)} />)}
      </div>

      <div className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,1fr)]'>
        <Panel title={t('Performance trend')} icon={Gauge}>
          {trendQuery.isLoading ? <Skeleton className='m-4 h-64' /> : trendQuery.isError ? <StateMessage error /> : trendQuery.data?.data.groups[0]?.series.length ? <div className='h-64 p-2'><VChart spec={buildTrendSpec(trendQuery.data.data.groups[0].series, topModel)} /></div> : <StateMessage empty />}
        </Panel>
        <Panel title={t('Models and channels at risk')} icon={AlertTriangle}>
          {hasPerformanceError || hasFlowError ? <StateMessage error /> : anomalyModels.length || channels.length ? <div className='divide-y'>
            {anomalyModels.map((model) => <div key={model.model_name} className='flex items-center justify-between gap-3 px-4 py-2.5'><span className='min-w-0 truncate font-mono text-xs'>{model.model_name}</span><span className='shrink-0 text-xs tabular-nums text-warning'>{formatPercent(model.success_rate)} · {formatNumber(model.avg_latency_ms)} ms</span></div>)}
            {channels.slice(0, 3).map((channel) => <div key={channel.name} className='flex items-center justify-between gap-3 px-4 py-2.5'><span className='flex min-w-0 items-center gap-2 truncate text-xs'><RadioTower className='size-3.5 shrink-0' />{channel.name}</span><span className='text-muted-foreground shrink-0 text-xs tabular-nums'>{formatCompactNumber(channel.requests)} {t('requests')}</span></div>)}
          </div> : <StateMessage empty />}
        </Panel>
      </div>

      <Panel title={t('Channel traffic')} icon={RadioTower}>
        {flowQuery.isLoading ? <div className='space-y-2 p-4'>{[1, 2, 3].map((item) => <Skeleton key={item} className='h-8 w-full' />)}</div> : hasFlowError ? <StateMessage error /> : channels.length ? <div className='grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3'>{channels.map((channel, index) => <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} key={channel.name} className='bg-muted/35 rounded-md border px-3 py-2'><div className='flex justify-between gap-2 text-xs'><span className='truncate font-medium'>{channel.name}</span><span className='tabular-nums'>{formatCompactNumber(channel.requests)}</span></div><div className='text-muted-foreground mt-1 text-[11px]'>{formatQuota(channel.consumption)} {t('consumed')}</div></motion.div>)}</div> : <StateMessage empty />}
      </Panel>

      {(hasUsageError || (!usageLoading && usage.length === 0)) && <Card><CardContent className='p-4'><StateMessage error={hasUsageError} empty={!hasUsageError} /></CardContent></Card>}
    </div>
  )
}

export { AdminDashboard }
