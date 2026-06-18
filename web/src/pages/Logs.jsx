import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, ArrowRight } from 'lucide-react'
import { get } from '../lib/api'

const fmtTime = (ts) => (ts ? String(ts).slice(11, 19) : '—')
const fmtMs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + 's')

const dotOf = (name) => {
  if (name === 'OpenAI') return 'bg-primary'
  if (name === 'Moonshot') return 'bg-warning'
  if (name === 'Vertex') return 'bg-danger'
  return 'bg-success'
}

export default function Logs() {
  const [search, setSearch] = useState('')
  const { data } = useQuery({
    queryKey: ['logs'],
    queryFn: () => get('/admin/logs?limit=200'),
    refetchInterval: 5000
  })
  const logs = (data?.data || []).filter(
    (l) => !search || (l.client_model || '').includes(search) || (l.provider_name || '').includes(search)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">请求日志</h1>
        <p className="text-[13px] text-text-muted mt-1">实时请求记录：耗时、首字延迟、token 与缓存统计</p>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="w-80 flex items-center gap-2 px-3.5 py-2 bg-bg-card border border-border rounded-lg">
          <Search size={14} className="text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型 / 提供商…"
            className="flex-1 bg-transparent text-[12px] focus:outline-none text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        <Dropdown label="全部提供商" />
        <Dropdown label="全部状态" />
      </div>

      <div className="rounded-xl bg-bg-card border border-border overflow-hidden">
        <div className="flex items-center px-5 py-3.5 bg-bg-elevated text-[11px] font-semibold text-text-muted">
          <div className="w-[130px]">时间</div>
          <div className="w-[110px]">提供商</div>
          <div className="w-[240px]">客户端模型</div>
          <div className="flex-1">上游模型</div>
          <div className="w-[70px]">首字</div>
          <div className="w-[80px]">总耗时</div>
          <div className="w-[140px]">入/出 tokens</div>
          <div className="w-[110px]">缓存 r/w</div>
          <div className="w-[70px]">状态</div>
        </div>
        {logs.length === 0 && (
          <div className="px-5 py-12 text-center text-text-muted text-sm">暂无请求记录</div>
        )}
        {logs.map((l) => {
          const isErr = (l.status || 0) >= 400 || l.error
          return (
            <div key={l.id} className="flex items-center px-5 py-3.5 border-t border-border text-sm">
              <div className="w-[130px] font-mono text-[12px] text-text-secondary">{fmtTime(l.ts)}</div>
              <div className="w-[110px] flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dotOf(l.provider_name)}`} />
                <span className="text-[12px]">{l.provider_name}</span>
              </div>
              <div className="w-[240px] font-mono text-[11px]">{l.client_model}</div>
              <div className="flex-1 flex items-center gap-1.5">
                <ArrowRight size={11} className="text-text-tertiary" />
                <span className="font-mono text-[11px] text-text-secondary">{l.upstream_model}</span>
              </div>
              <div className="w-[70px] font-mono text-[11px] text-text-muted">{fmtMs(l.ttft_ms)}</div>
              <div className="w-[80px] font-mono text-[11px] text-text-primary">{fmtMs(l.duration_ms)}</div>
              <div className="w-[140px] font-mono text-[11px] text-text-secondary">
                {l.input_tokens || 0} / {l.output_tokens || 0}
              </div>
              <div
                className={`w-[110px] font-mono text-[11px] ${
                  (l.cache_r || 0) + (l.cache_w || 0) > 0 ? 'text-success' : 'text-text-muted'
                }`}
              >
                {l.cache_r || 0} / {l.cache_w || 0}
              </div>
              <div className="w-[70px]">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                    isErr ? 'text-danger' : 'text-success'
                  }`}
                  style={{ background: isErr ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)' }}
                >
                  {l.status || (l.error ? 'ERR' : '200')}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const Dropdown = ({ label }) => (
  <div className="px-3.5 py-2 bg-bg-card border border-border rounded-lg flex items-center gap-2 text-[12px] text-text-secondary min-w-[120px]">
    {label}
    <ChevronDown size={12} className="text-text-muted ml-auto" />
  </div>
)
