import {
  Activity,
  Anchor,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  RefreshCw,
  Waves,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const STATION_ID = '9410135'
const STATION_NAME = 'South San Diego Bay'
const NOAA_STATION_URL = `https://tidesandcurrents.noaa.gov/stationhome.html?id=${STATION_ID}`
const NOAA_API_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

type TidePoint = {
  time: Date
  height: number
}

type TideExtreme = TidePoint & {
  type: 'H' | 'L'
}

type LoadState =
  | { status: 'loading'; message?: string }
  | { status: 'ready'; predictions: TidePoint[]; extremes: TideExtreme[]; loadedAt: Date }
  | { status: 'error'; message: string }

type NoaaPrediction = {
  t: string
  v: string
  type?: 'H' | 'L'
}

type NoaaResponse = {
  predictions?: NoaaPrediction[]
  error?: {
    message?: string
  }
}

function formatNoaaDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}${month}${day}`
}

function parseStationTime(value: string) {
  const [datePart, timePart] = value.split(' ')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)

  return new Date(year, month - 1, day, hour, minute)
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDayTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatHeight(value: number) {
  return `${value.toFixed(1)} ft`
}

async function fetchNoaaPredictions(days: number, interval: string) {
  const params = new URLSearchParams({
    product: 'predictions',
    application: 'MorTide',
    begin_date: formatNoaaDate(new Date()),
    range: String(days * 24),
    datum: 'MLLW',
    station: STATION_ID,
    time_zone: 'lst_ldt',
    units: 'english',
    interval,
    format: 'json',
  })

  const response = await fetch(`${NOAA_API_URL}?${params}`)

  if (!response.ok) {
    throw new Error(`NOAA returned ${response.status}`)
  }

  const data = (await response.json()) as NoaaResponse

  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  if (!data.predictions?.length) {
    throw new Error('NOAA returned no tide predictions for this window.')
  }

  return data.predictions
}

async function loadTides(days: number) {
  const [predictionRows, extremeRows] = await Promise.all([
    fetchNoaaPredictions(days, '30'),
    fetchNoaaPredictions(days, 'hilo'),
  ])

  const predictions = predictionRows.map((row) => ({
    time: parseStationTime(row.t),
    height: Number.parseFloat(row.v),
  }))

  const extremes = extremeRows
    .filter((row): row is NoaaPrediction & { type: 'H' | 'L' } => row.type === 'H' || row.type === 'L')
    .map((row) => ({
      time: parseStationTime(row.t),
      height: Number.parseFloat(row.v),
      type: row.type,
    }))

  return { predictions, extremes }
}

function estimateCurrentHeight(points: TidePoint[], now = new Date()) {
  if (points.length < 2) return null

  const currentTime = now.getTime()
  const nextIndex = points.findIndex((point) => point.time.getTime() >= currentTime)

  if (nextIndex <= 0) return null

  const before = points[nextIndex - 1]
  const after = points[nextIndex]
  const start = before.time.getTime()
  const end = after.time.getTime()
  const progress = (currentTime - start) / (end - start)
  const height = before.height + (after.height - before.height) * progress

  return {
    height,
    trend: after.height >= before.height ? 'rising' : 'falling',
  }
}

function findNextExtreme(extremes: TideExtreme[], type: 'H' | 'L', now: Date) {
  const currentTime = now.getTime()
  return extremes.find((extreme) => extreme.type === type && extreme.time.getTime() > currentTime)
}

function getVisibleRange(points: TidePoint[]) {
  const heights = points.map((point) => point.height)
  return {
    min: Math.min(...heights),
    max: Math.max(...heights),
    range: Math.max(...heights) - Math.min(...heights),
  }
}

function TideChart({
  predictions,
  extremes,
  now,
}: {
  predictions: TidePoint[]
  extremes: TideExtreme[]
  now: Date
}) {
  const width = 900
  const height = 360
  const padding = { top: 22, right: 24, bottom: 50, left: 58 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const startTime = predictions[0].time.getTime()
  const endTime = predictions[predictions.length - 1].time.getTime()
  const rawMin = Math.min(...predictions.map((point) => point.height))
  const rawMax = Math.max(...predictions.map((point) => point.height))
  const minY = Math.floor((rawMin - 0.45) * 2) / 2
  const maxY = Math.ceil((rawMax + 0.45) * 2) / 2
  const ySpan = maxY - minY || 1
  const currentTime = now.getTime()
  const nowInRange = currentTime >= startTime && currentTime <= endTime

  const xScale = (time: number) => padding.left + ((time - startTime) / (endTime - startTime)) * chartWidth
  const yScale = (heightValue: number) => padding.top + ((maxY - heightValue) / ySpan) * chartHeight
  const linePath = predictions
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command} ${xScale(point.time.getTime()).toFixed(2)} ${yScale(point.height).toFixed(2)}`
    })
    .join(' ')
  const areaPath = `${linePath} L ${xScale(endTime).toFixed(2)} ${yScale(minY).toFixed(2)} L ${xScale(startTime).toFixed(2)} ${yScale(minY).toFixed(2)} Z`

  const gridValues = Array.from({ length: 5 }, (_, index) => minY + (ySpan / 4) * index)
  const tickTimes = predictions.filter((point) => point.time.getMinutes() === 0 && point.time.getHours() % 6 === 0)

  return (
    <svg className="tide-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tide prediction graph">
      <defs>
        <linearGradient id="tideFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#29a0b1" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#f3c766" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {gridValues.map((value) => (
        <g key={value}>
          <line className="grid-line" x1={padding.left} x2={width - padding.right} y1={yScale(value)} y2={yScale(value)} />
          <text className="axis-label y-label" x={padding.left - 14} y={yScale(value) + 4}>
            {value.toFixed(1)}
          </text>
        </g>
      ))}

      {tickTimes.map((point) => (
        <g key={point.time.toISOString()}>
          <line className="time-line" x1={xScale(point.time.getTime())} x2={xScale(point.time.getTime())} y1={padding.top} y2={height - padding.bottom} />
          <text className="axis-label x-label" x={xScale(point.time.getTime())} y={height - 20}>
            {point.time.getHours() === 0 ? formatDateLabel(point.time) : formatTime(point.time)}
          </text>
        </g>
      ))}

      <path className="tide-area" d={areaPath} />
      <path className="tide-line" d={linePath} />

      {extremes.map((extreme) => {
        const cx = xScale(extreme.time.getTime())
        const cy = yScale(extreme.height)

        if (cx < padding.left || cx > width - padding.right) return null

        return (
          <g className={`extreme extreme-${extreme.type.toLowerCase()}`} key={`${extreme.type}-${extreme.time.toISOString()}`}>
            <circle cx={cx} cy={cy} r="5.5" />
            <text x={cx} y={extreme.type === 'H' ? cy - 12 : cy + 22}>
              {extreme.type}
            </text>
          </g>
        )
      })}

      {nowInRange && (
        <g>
          <line className="now-line" x1={xScale(currentTime)} x2={xScale(currentTime)} y1={padding.top} y2={height - padding.bottom} />
          <text className="now-label" x={xScale(currentTime) + 8} y={padding.top + 16}>
            now
          </text>
        </g>
      )}
    </svg>
  )
}

function StatPanel({
  icon,
  label,
  value,
  detail,
  className = '',
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  className?: string
}) {
  return (
    <section className={`stat-panel ${className}`.trim()}>
      <div className="stat-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </section>
  )
}

function App() {
  const [days, setDays] = useState(1)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })

  const refresh = useCallback(() => {
    setLoadState({ status: 'loading' })
    setRefreshIndex((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    loadTides(days)
      .then(({ predictions, extremes }) => {
        if (!cancelled) {
          setLoadState({ status: 'ready', predictions, extremes, loadedAt: new Date() })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load tide predictions.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [days, refreshIndex])

  const summary = useMemo(() => {
    if (loadState.status !== 'ready') return null

    const nextHigh = findNextExtreme(loadState.extremes, 'H', loadState.loadedAt)
    const nextLow = findNextExtreme(loadState.extremes, 'L', loadState.loadedAt)
    const current = estimateCurrentHeight(loadState.predictions, loadState.loadedAt)
    const visibleRange = getVisibleRange(loadState.predictions)

    return {
      nextHigh,
      nextLow,
      current,
      visibleRange,
    }
  }, [loadState])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href={NOAA_STATION_URL} target="_blank" rel="noreferrer" aria-label="Open NOAA station page">
          <span>
            <Waves size={20} strokeWidth={2.4} />
          </span>
          <strong>MorTide</strong>
        </a>

        <nav className="range-control" aria-label="Forecast range">
          {[1, 2, 3].map((value) => (
            <button
              className={days === value ? 'active' : ''}
              key={value}
              onClick={() => {
                if (value !== days) {
                  setLoadState({ status: 'loading' })
                  setDays(value)
                }
              }}
              type="button"
            >
              {value * 24}h
            </button>
          ))}
        </nav>

        <button className="icon-button" onClick={refresh} type="button" aria-label="Refresh tide predictions" title="Refresh">
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="station-band">
        <div>
          <p className="eyebrow">NOAA tide predictions</p>
          <h1>{STATION_NAME}</h1>
          <p className="station-meta">
            Station {STATION_ID} · Heights in feet relative to MLLW · Local station time
          </p>
        </div>
        <a className="station-link" href={NOAA_STATION_URL} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          NOAA station
        </a>
      </section>

      {loadState.status === 'loading' && (
        <section className="status-surface" aria-live="polite">
          <Activity size={22} />
          <strong>Loading tide predictions</strong>
        </section>
      )}

      {loadState.status === 'error' && (
        <section className="status-surface error" aria-live="polite">
          <Activity size={22} />
          <strong>{loadState.message}</strong>
          <button onClick={refresh} type="button">
            Try again
          </button>
        </section>
      )}

      {loadState.status === 'ready' && summary && (
        <>
          <section className="summary-grid" aria-label="Tide summary">
            <StatPanel
              detail={summary.current ? summary.current.trend : 'between prediction samples'}
              icon={summary.current?.trend === 'falling' ? <ArrowDown size={19} /> : <ArrowUp size={19} />}
              label="Estimated now"
              value={summary.current ? formatHeight(summary.current.height) : 'Outside range'}
            />
            <StatPanel
              className="extreme-summary"
              detail={summary.nextHigh ? formatDayTime(summary.nextHigh.time) : 'not in loaded range'}
              icon={<ArrowUp size={19} />}
              label="Next high"
              value={summary.nextHigh ? formatHeight(summary.nextHigh.height) : 'No high'}
            />
            <StatPanel
              className="extreme-summary"
              detail={summary.nextLow ? formatDayTime(summary.nextLow.time) : 'not in loaded range'}
              icon={<ArrowDown size={19} />}
              label="Next low"
              value={summary.nextLow ? formatHeight(summary.nextLow.height) : 'No low'}
            />
            <StatPanel
              detail={`${formatHeight(summary.visibleRange.min)} to ${formatHeight(summary.visibleRange.max)}`}
              icon={<Anchor size={19} />}
              label={`${days * 24}h swing`}
              value={formatHeight(summary.visibleRange.range)}
            />
          </section>

          <section className="chart-surface">
            <div className="chart-heading">
              <div>
                <p>Prediction curve</p>
                <strong>{formatDateLabel(loadState.predictions[0].time)} - {formatDateLabel(loadState.predictions[loadState.predictions.length - 1].time)}</strong>
              </div>
              <span>Updated {formatTime(loadState.loadedAt)}</span>
            </div>
            <TideChart predictions={loadState.predictions} extremes={loadState.extremes} now={loadState.loadedAt} />
            <div className="chart-extremes" aria-label="Next high and low tides">
              <div className="chart-extreme high">
                <ArrowUp size={16} />
                <span>Next high</span>
                <strong>{summary.nextHigh ? formatHeight(summary.nextHigh.height) : 'No high'}</strong>
                <small>{summary.nextHigh ? formatDayTime(summary.nextHigh.time) : 'not in range'}</small>
              </div>
              <div className="chart-extreme low">
                <ArrowDown size={16} />
                <span>Next low</span>
                <strong>{summary.nextLow ? formatHeight(summary.nextLow.height) : 'No low'}</strong>
                <small>{summary.nextLow ? formatDayTime(summary.nextLow.time) : 'not in range'}</small>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

export default App
