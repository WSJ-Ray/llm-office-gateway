import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { get } from '../lib/api'

const fmtMs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + 's')
const fmtNum = (n) => Number(n || 0).toLocaleString()
const fmtM = (n) => ((Number(n) || 0) / 1e6).toFixed(2) + 'M'

const Metric = ({ label, value, sub, valueClass = '' }) => (
  <div className="flex-1 p-[18px] rounded-[10px] bg-bg-card border border-border">
    <div className="text-[12px] text-text-secondary mb-1.5">{label}</div>
    <div className={`text-[28px] font-semibold leading-tight ${valueClass || 'text-text-primary'}`}>{value}</div>
    {sub && <div className="text-[11px] text-text-muted mt-1">{sub}</div>}
  </div>
)

const Bar = ({ h, max }) => {
  const pct = max > 0 ? (h.count / max) * 100 : 0
  const hasErr = h.errors > 0
  const cacheTotal = (h.cache_r || 0) + (h.cache_w || 0)
  const cacheInfo = cacheTotal > 0 ? ` · 缓存 ${fmtNum(cacheTotal)}` : ''
  return (
    <div className="flex-1 flex flex-col items-center gap-1 group relative" title={`${h.hour} · ${h.count} 次${h.errors ? `（${h.errors} 错误）` : ''}${cacheInfo}`}>
      <div className="w-full flex flex-col justify-end h-44">
        <div
          className={`w-full rounded-t ${hasErr ? 'bg-danger' : 'bg-primary'} opacity-80 group-hover:opacity-100 transition-opacity`}
          style={{ height: `${Math.max(pct, h.count > 0 ? 6 : 0)}%` }}
        />
      </div>
    </div>
  )
}

const Status = ({ l }) => {
  const isErr = (l.status || 0) >= 400 || l.error
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${isErr ? 'text-danger' : 'text-success'}`}
      style={{ background: isErr ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)' }}
    >
      {l.status || (l.error ? 'ERR' : '200')}
    </span>
  )
}

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => get('/admin/stats'),
    refetchInterval: 5000
  })
  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => get('/admin/providers'),
    refetchInterval: 5000
  })

  const s = stats?.summary || { total: 0, errors: 0, input_tokens: 0, output_tokens: 0, total_input_tokens: 0, avg_ttft_ms: 0, avg_duration_ms: 0, cache_w: 0, cache_r: 0 }
  const errRate = s.total > 0 ? ((s.errors / s.total) * 100).toFixed(1) : '0.0'
  const cacheHit = (Number(s.total_input_tokens) || 0) > 0
    ? (((Number(s.cache_r) || 0) / (Number(s.total_input_tokens) || 0)) * 100).toFixed(1) + '%'
    : '—'
  const def = (providers?.data || []).find((p) => p.is_default) || (providers?.data || [])[0]

  const hourly = stats?.hourly || []
  const maxCount = Math.max(1, ...hourly.map((h) => h.count))
  const byProvider = stats?.by_provider || []
  const maxProv = Math.max(1, ...byProvider.map((p) => p.count))
  const recent = stats?.recent || []

  return (
    <div className="space-y-7">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">服务状态</h1>
          <p className="text-[13px] text-text-muted mt-1">网关运行状态与全局请求概览</p>
        </div>
        <div className="px-3 py-1.5 rounded-full text-success text-[12px] flex items-center gap-1.5" style={{ background: 'rgba(52,211,153,0.12)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          在线
        </div>
      </div>

      <div className="flex gap-4">
        <Metric label="总请求数" value={fmtNum(s.total)} sub="累计" />
        <Metric label="错误率" value={errRate + '%'} sub={`${s.errors} / ${s.total}`} valueClass={Number(errRate) > 5 ? 'text-danger' : 'text-success'} />
        <Metric
          label="Token 用量"
          value={fmtM(s.input_tokens + s.output_tokens)}
          sub={`入 ${fmtM(s.input_tokens)} · 出 ${fmtM(s.output_tokens)}`}
        />
        <Metric label="平均首字延迟" value={fmtMs(s.avg_ttft_ms)} sub={`平均总耗时 ${fmtMs(s.avg_duration_ms)}`} />
      </div>

      <div className="flex gap-4">
        <Metric label="缓存命中率" value={cacheHit} sub={`读 ${fmtNum(s.cache_r)} · 写 ${fmtNum(s.cache_w)}`} />
        <Metric label="已映射模型" value={fmtNum(stats?.mappings_count || 0)} sub="客户端可用模型数" />
        <Metric label="提供商总数" value={fmtNum(providers?.data?.length || 0)} sub={`启用中 ${providers?.data?.filter((p) => p.enabled).length || 0}`} />
        <Metric
          label="默认提供商"
          value={def?.name || '—'}
          sub={def?.format ? `${def.format} 格式` : ''}
          valueClass="text-primary"
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 p-5 rounded-xl bg-bg-card border border-border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold">请求量趋势（近 24 小时）</h2>
            <span className="text-[11px] text-text-muted">实时</span>
          </div>
          <div className="flex items-end gap-1 h-48">
            {hourly.length === 0 && (
              <div className="w-full h-full flex items-center justify-center text-[12px] text-text-muted">暂无数据</div>
            )}
            {hourly.map((h, i) => (
              <Bar key={i} h={h} max={maxCount} />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-text-muted font-mono">
            <span>{hourly[0]?.hour || ''}</span>
            <span>峰值 {maxCount} 次/小时</span>
            <span>{hourly[hourly.length - 1]?.hour || ''}</span>
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary" />正常</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-danger" />含错误</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-bg-card border border-border space-y-3">
          <h2 className="text-sm font-semibold">按提供商分布</h2>
          {byProvider.length === 0 && (
            <div className="text-[12px] text-text-muted py-8 text-center">暂无请求</div>
          )}
          {byProvider.map((p) => {
            const pct = (p.count / maxProv) * 100
            const errPct = p.count > 0 ? (p.errors / p.count) * 100 : 0
            const totalInput = p.total_input_tokens || (p.input_tokens + p.output_tokens + (p.cache_r || 0) + (p.cache_w || 0))
            const cacheHit = totalInput > 0
              ? ((p.cache_r / totalInput) * 100).toFixed(1) + '%'
              : '—'
            const hasCache = (p.cache_r || 0) + (p.cache_w || 0) > 0
            return (
              <div key={p.name} className="space-y-1.5">
                <div className="flex justify-between text-[12px]">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-text-muted font-mono">{p.count} · {errPct.toFixed(0)}% err</span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                  <div className={`h-full rounded-full ${errPct > 0 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[10px] text-text-muted font-mono">
                  入 {fmtNum(p.input_tokens)} · 出 {fmtNum(p.output_tokens)} · TTFT {fmtMs(p.avg_ttft_ms)}
                  {hasCache && <span className="text-success"> · 缓存 {cacheHit}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl bg-bg-card border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-bg-elevated">
          <h2 className="text-[13px] font-semibold text-text-primary">最近请求</h2>
          <span className="text-[11px] text-text-muted">最多 8 条</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12px] text-text-muted">暂无请求记录</div>
        ) : (
          <div className="px-5 py-3.5 text-[12px] space-y-2.5">
            {recent.map((l) => (
              <div key={l.id} className="flex items-center gap-3">
                <Status l={l} />
                <span className="font-mono text-[11px] text-text-muted w-[70px]">{String(l.ts || '').slice(11, 19)}</span>
                <span className="text-text-secondary w-[90px] truncate">{l.provider_name}</span>
                <span className="font-mono text-[11px] text-text-primary truncate flex-1">{l.client_model}</span>
                <ArrowRight size={11} className="text-text-tertiary shrink-0" />
                <span className="font-mono text-[11px] text-text-secondary w-[120px] truncate">{l.upstream_model}</span>
                <span className="font-mono text-[11px] text-text-muted w-[90px]">{fmtMs(l.duration_ms)}</span>
                <span className="font-mono text-[11px] text-text-muted w-[80px]">
                  {l.input_tokens || 0}/{l.output_tokens || 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
