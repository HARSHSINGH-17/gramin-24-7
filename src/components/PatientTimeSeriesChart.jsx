import React from 'react'
import { AlertTriangle, Clock, Info } from 'lucide-react'
import { formatTime, formatAge } from '../RpmDashboard'
import { VITAL_CONFIGS } from './patientTimeSeriesConfig.js'

export { VITAL_CONFIGS }


export default function PatientTimeSeriesChart({
  measurements = [],
  alerts = [],
  thresholds = {},
  timeRange = '24h',
  onTimeRangeChange,
  activeVital = 'heart_rate',
  onVitalChange,
}) {
  const [hoveredPoint, setHoveredPoint] = React.useState(null)

  // 1. Time range filtering
  const now = new Date()
  const filteredMeasurements = React.useMemo(() => {
    if (!measurements.length) return []
    if (timeRange === 'all') return [...measurements]

    let windowMs = 24 * 3600 * 1000
    if (timeRange === '6h') windowMs = 6 * 3600 * 1000
    if (timeRange === '7d') windowMs = 7 * 24 * 3600 * 1000

    // Reference time: use now, or latest measurement if in the past
    const latestTime = measurements.reduce((max, m) => {
      const t = new Date(m.measured_at).getTime()
      return t > max ? t : max
    }, 0)

    const refTime = Math.max(now.getTime(), latestTime)
    const cutoff = refTime - windowMs

    return measurements.filter((m) => new Date(m.measured_at).getTime() >= cutoff)
  }, [measurements, timeRange])

  // 2. Extract series for active vital
  const seriesData = React.useMemo(() => {
    if (activeVital === 'blood_pressure') {
      const sys = filteredMeasurements
        .filter((m) => m.measurement_type === 'systolic_blood_pressure')
        .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at))
      const dia = filteredMeasurements
        .filter((m) => m.measurement_type === 'diastolic_blood_pressure')
        .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at))
      return { isDual: true, sys, dia, points: [...sys, ...dia] }
    }

    const points = filteredMeasurements
      .filter((m) => m.measurement_type === activeVital)
      .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at))
    return { isDual: false, points }
  }, [filteredMeasurements, activeVital])

  // 3. Resolve configured thresholds (from backend or fallback to backend demo constants)
  const config = VITAL_CONFIGS[activeVital] || VITAL_CONFIGS.heart_rate
  const threshMin =
    thresholds[activeVital]?.minimum ?? config.defaultMin ?? null
  const threshMax =
    thresholds[activeVital]?.maximum ?? config.defaultMax ?? null

  // 4. Calculate chart scales and bounds
  const chartBounds = React.useMemo(() => {
    const allVals = seriesData.points.map((p) => Number(p.value)).filter((v) => !Number.isNaN(v))
    if (threshMin !== null && threshMin !== undefined) allVals.push(threshMin)
    if (threshMax !== null && threshMax !== undefined) allVals.push(threshMax)

    if (activeVital === 'blood_pressure') {
      allVals.push(60, 90, 120, 180)
    }

    if (!allVals.length) {
      return { yMin: 0, yMax: 100, tMin: 0, tMax: 1 }
    }

    const valMin = Math.min(...allVals)
    const valMax = Math.max(...allVals)
    const pad = Math.max(5, (valMax - valMin) * 0.15)
    const yMin = Math.max(0, Math.floor(valMin - pad))
    const yMax = Math.ceil(valMax + pad)

    const allTimes = seriesData.points.map((p) => new Date(p.measured_at).getTime())
    const tMin = allTimes.length ? Math.min(...allTimes) : 0
    const tMax = allTimes.length ? Math.max(...allTimes) : 1

    return { yMin, yMax, tMin, tMax }
  }, [seriesData, threshMin, threshMax, activeVital])

  const W = 800
  const H = 280
  const padLeft = 60
  const padRight = 30
  const padTop = 30
  const padBottom = 40
  const plotW = W - padLeft - padRight
  const plotH = H - padTop - padBottom

  const getX = (timeMs) => {
    if (chartBounds.tMax <= chartBounds.tMin) return padLeft + plotW / 2
    const frac = (timeMs - chartBounds.tMin) / (chartBounds.tMax - chartBounds.tMin)
    return padLeft + Math.max(0, Math.min(1, frac)) * plotW
  }

  const getY = (val) => {
    if (chartBounds.yMax <= chartBounds.yMin) return padTop + plotH / 2
    const frac = (val - chartBounds.yMin) / (chartBounds.yMax - chartBounds.yMin)
    return padTop + plotH - Math.max(0, Math.min(1, frac)) * plotH
  }

  // 5. Generate polyline segments with gap detection
  const generateSegments = (items) => {
    if (items.length < 2) return []
    const segments = []
    let currentSegment = []

    // Gap threshold: 4h for 24h/6h, 12h for 7d/all
    const gapThresholdMs = timeRange === '6h' || timeRange === '24h' ? 4 * 3600 * 1000 : 12 * 3600 * 1000

    for (let i = 0; i < items.length; i++) {
      const p = items[i]
      const t = new Date(p.measured_at).getTime()
      if (currentSegment.length > 0) {
        const prevT = new Date(items[i - 1].measured_at).getTime()
        if (t - prevT > gapThresholdMs) {
          // Break segment due to gap
          if (currentSegment.length > 1) {
            segments.push(currentSegment)
          }
          currentSegment = []
        }
      }
      currentSegment.push(p)
    }
    if (currentSegment.length > 1) {
      segments.push(currentSegment)
    }
    return segments
  }

  const singleSegments = !seriesData.isDual ? generateSegments(seriesData.points) : []
  const sysSegments = seriesData.isDual ? generateSegments(seriesData.sys) : []
  const diaSegments = seriesData.isDual ? generateSegments(seriesData.dia) : []

  // Horizontal Y-grid ticks (4 evenly spaced ticks)
  const yTicks = [
    chartBounds.yMin,
    Math.round(chartBounds.yMin + (chartBounds.yMax - chartBounds.yMin) * 0.33),
    Math.round(chartBounds.yMin + (chartBounds.yMax - chartBounds.yMin) * 0.66),
    chartBounds.yMax,
  ]

  // Sparse check
  const isSparse = seriesData.points.length > 0 && seriesData.points.length <= 2

  return (
    <div className="rpm-chart-card" aria-label="Interactive Time-Series Telemetry Analysis">
      <div className="rpm-chart-header">
        <div className="rpm-chart-title-area">
          <h3>Physiological Telemetry · Longitudinal Trends</h3>
          <p>
            Chronological observations plotted over time. Telemetry intervals and observation gaps are
            rendered without interpolation.
          </p>
        </div>

        {/* Time range selector buttons */}
        <div className="rpm-time-range-group" role="group" aria-label="Select chart time range">
          {['6h', '24h', '7d', 'all'].map((rangeKey) => (
            <button
              key={rangeKey}
              type="button"
              className={`rpm-range-btn ${timeRange === rangeKey ? 'active' : ''}`}
              onClick={() => onTimeRangeChange && onTimeRangeChange(rangeKey)}
              aria-pressed={timeRange === rangeKey}
            >
              {rangeKey === 'all' ? 'All' : rangeKey.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Vital type selector tabs */}
      <div className="rpm-chart-controls-bar">
        <div className="rpm-chart-tabs" role="tablist" aria-label="Select vital type to plot">
          {Object.entries(VITAL_CONFIGS).map(([vKey, vConf]) => (
            <button
              key={vKey}
              type="button"
              role="tab"
              aria-selected={activeVital === vKey}
              className={`rpm-chart-tab-btn ${activeVital === vKey ? 'active' : ''}`}
              onClick={() => onVitalChange && onVitalChange(vKey)}
            >
              {vConf.label} ({vConf.unit})
            </button>
          ))}
        </div>

        <div className="rpm-chart-legend-row">
          {!seriesData.isDual ? (
            <div className="rpm-chart-legend-chip">
              <span className="rpm-legend-line" style={{ background: config.color }} />
              <span>{config.label} ({config.unit})</span>
            </div>
          ) : (
            <>
              <div className="rpm-chart-legend-chip">
                <span className="rpm-legend-line" style={{ background: config.sysConfig.color }} />
                <span>Systolic BP (mmHg)</span>
              </div>
              <div className="rpm-chart-legend-chip">
                <span className="rpm-legend-line" style={{ background: config.diaConfig.color }} />
                <span>Diastolic BP (mmHg)</span>
              </div>
            </>
          )}

          {threshMax !== null && threshMax !== undefined && (
            <div className="rpm-chart-legend-chip">
              <span className="rpm-legend-dashed" style={{ borderColor: '#f43f5e' }} />
              <span>Demo Max ({threshMax})</span>
            </div>
          )}

          {threshMin !== null && threshMin !== undefined && (
            <div className="rpm-chart-legend-chip">
              <span className="rpm-legend-dashed" style={{ borderColor: '#f59e0b' }} />
              <span>Demo Min ({threshMin})</span>
            </div>
          )}
        </div>
      </div>

      {/* Sparse data notice */}
      {isSparse && (
        <div className="rpm-chart-sparse-banner">
          <Info size={16} />
          <span>
            <strong>Sparse Telemetry:</strong> Only {seriesData.points.length} observation(s)
            recorded in this window. Data points are rendered honestly without artificial smoothing.
          </span>
        </div>
      )}

      {/* Empty State */}
      {seriesData.points.length === 0 ? (
        <div className="rpm-empty-state" style={{ padding: '40px 20px', border: 'none' }}>
          <Clock size={28} style={{ color: '#94a3b8', margin: '0 auto 10px' }} />
          <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>No {config.label} observations in this window</h4>
          <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
            Try expanding the time range to <strong>7D</strong> or <strong>All History</strong> to view recorded telemetry.
          </p>
        </div>
      ) : (
        <div className="rpm-chart-svg-wrap">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="rpm-chart-svg"
            role="img"
            aria-label={`${config.label} time-series chart over ${timeRange}`}
          >
            {/* Safe zone background between min and max */}
            {threshMin !== null && threshMax !== null && (
              <rect
                x={padLeft}
                y={getY(threshMax)}
                width={plotW}
                height={Math.max(0, getY(threshMin) - getY(threshMax))}
                fill="rgba(16, 185, 129, 0.04)"
              />
            )}

            {/* Horizontal Grid lines and Y labels */}
            {yTicks.map((tickVal) => {
              const yPos = getY(tickVal)
              return (
                <g key={tickVal}>
                  <line
                    x1={padLeft}
                    y1={yPos}
                    x2={padLeft + plotW}
                    y2={yPos}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={padLeft - 8}
                    y={yPos + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748b"
                    fontFamily="sans-serif"
                  >
                    {tickVal}
                  </text>
                </g>
              )
            })}

            {/* Threshold Max Guide Line */}
            {threshMax !== null && threshMax !== undefined && (
              <g>
                <line
                  x1={padLeft}
                  y1={getY(threshMax)}
                  x2={padLeft + plotW}
                  y2={getY(threshMax)}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={padLeft + plotW - 4}
                  y={getY(threshMax) - 6}
                  textAnchor="end"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#f43f5e"
                >
                  Demo Max: {threshMax} {config.unit}
                </text>
              </g>
            )}

            {/* Threshold Min Guide Line */}
            {threshMin !== null && threshMin !== undefined && (
              <g>
                <line
                  x1={padLeft}
                  y1={getY(threshMin)}
                  x2={padLeft + plotW}
                  y2={getY(threshMin)}
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text
                  x={padLeft + plotW - 4}
                  y={getY(threshMin) + 14}
                  textAnchor="end"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#f59e0b"
                >
                  Demo Min: {threshMin} {config.unit}
                </text>
              </g>
            )}

            {/* Single Series Polyline Segments */}
            {!seriesData.isDual &&
              singleSegments.map((seg, idx) => {
                const pointsStr = seg
                  .map((p) => `${getX(new Date(p.measured_at).getTime())},${getY(Number(p.value))}`)
                  .join(' ')
                return (
                  <polyline
                    key={idx}
                    points={pointsStr}
                    fill="none"
                    stroke={config.color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              })}

            {/* Dual Series (Systolic & Diastolic) */}
            {seriesData.isDual && (
              <>
                {sysSegments.map((seg, idx) => {
                  const pointsStr = seg
                    .map((p) => `${getX(new Date(p.measured_at).getTime())},${getY(Number(p.value))}`)
                    .join(' ')
                  return (
                    <polyline
                      key={`sys-${idx}`}
                      points={pointsStr}
                      fill="none"
                      stroke={config.sysConfig.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                })}
                {diaSegments.map((seg, idx) => {
                  const pointsStr = seg
                    .map((p) => `${getX(new Date(p.measured_at).getTime())},${getY(Number(p.value))}`)
                    .join(' ')
                  return (
                    <polyline
                      key={`dia-${idx}`}
                      points={pointsStr}
                      fill="none"
                      stroke={config.diaConfig.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                })}
              </>
            )}

            {/* Interactive Data Points */}
            {seriesData.points.map((p) => {
              const t = new Date(p.measured_at).getTime()
              const cx = getX(t)
              const cy = getY(Number(p.value))
              const isHovered = hoveredPoint?.event_id === p.event_id
              const isSys = p.measurement_type === 'systolic_blood_pressure'
              const ptColor = seriesData.isDual
                ? isSys
                  ? config.sysConfig.color
                  : config.diaConfig.color
                : config.color

              return (
                <circle
                  key={p.event_id}
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? '#ffffff' : ptColor}
                  stroke={ptColor}
                  strokeWidth={isHovered ? 3 : 1.5}
                  style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                  onMouseEnter={() => setHoveredPoint(p)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              )
            })}

            {/* X-axis Ticks (Time labels) */}
            <g>
              <line
                x1={padLeft}
                y1={padTop + plotH}
                x2={padLeft + plotW}
                y2={padTop + plotH}
                stroke="#cbd5e1"
                strokeWidth="1"
              />
              <text
                x={padLeft}
                y={padTop + plotH + 18}
                textAnchor="start"
                fontSize="10"
                fill="#64748b"
              >
                {formatTime(new Date(chartBounds.tMin).toISOString())}
              </text>
              <text
                x={padLeft + plotW}
                y={padTop + plotH + 18}
                textAnchor="end"
                fontSize="10"
                fill="#64748b"
              >
                {formatTime(new Date(chartBounds.tMax).toISOString())}
              </text>
            </g>
          </svg>

          {/* Interactive Tooltip Card */}
          {hoveredPoint && (
            <div className="rpm-chart-tooltip-box">
              <strong style={{ fontSize: '13px' }}>
                {hoveredPoint.value} {hoveredPoint.unit}
              </strong>
              <span>Measured: {formatTime(hoveredPoint.measured_at)}</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {formatAge(hoveredPoint.measured_at, now)} · Source: {hoveredPoint.source || 'patient'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Demo threshold guidance footnote */}
      <div className="rpm-chart-demo-footnote">
        <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <span>
          <strong>DEMONSTRATION ONLY:</strong> Threshold bounds are software demonstration rules,
          not clinically validated diagnostic or treatment guidance.
        </span>
      </div>
    </div>
  )
}
