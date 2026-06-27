import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, Check, ArrowRight } from 'lucide-react'
import { get } from '../lib/api'

const fmtTime = (ts) => (ts ? String(ts).slice(11, 19) : '—')
const fmtMs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + 's')

const dotOf = (name) => {
  if (name === 'OpenAI') return 'bg-primary'
  if (name === 'Moonshot') return 'bg-warning'
  if (name === 'Vertex') return 'bg-danger'
  return 'bg-success'
}

const isErr = (l) => (l.status || 0) >= 400 || !!l.error

export default function Logs() {
  const [search, setSearch] = useState('')
  const [prov, setProv] = useState('all')
  const [status, setStatus] = useState('all')
  const { data } = useQuery({
    queryKey: ['logs'],
    queryFn: () => get('/admin/logs?limit=200'),
    refetchInterval: 5000
  })

  const all = data?.data || []
  // 提供商选项取自实际出现的日志，避免列出无请求的提供商
  const provOptions = ['all', ...Array.from(new Set(all.map((l) => l.provider_name).filter(Boolean)))]

  const logs = all.filter((l) => {
    if (prov !== 'all' && l.provider_name !== prov) return false
    if (status === 'success' && isErr(l)) return false
    if (status === 'error' && !isErr(l)) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [l.client_model, l.provider_name, l.upstream_model, l.error || '']
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">请求日志</h1>
        <p className="text-[13px] text-text-muted mt-1">实时请求记录：耗时、首字延迟、token 与缓存统计</p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="w-80 flex items-center gap-2 px-3.5 py-2 bg-bg-card border border-border rounded-lg">
          <Search size={14} className="text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型 / 提供商 / 上游 / 错误…"
            className="flex-1 bg-transparent text-[12px] focus:outline-none text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        <Dropdown
          value={prov}
          onChange={setProv}
          options={provOptions}
          labelOf={(v) => (v === 'all' ? '全部提供商' : v)}
        />
        <Dropdown
          value={status}
          onChange={setStatus}
          options={['all', 'success', 'error']}
          labelOf={(v) => ({ all: '全部状态', success: '成功', error: '错误' }[v])}
        />
        <span className="text-[11px] text-text-muted font-mono ml-auto">
          {logs.length} / {all.length} 条
        </span>
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
          <div className="w-[100px]">总量</div>
          <div className="w-[110px]">缓存 r/w</div>
          <div className="w-[70px]">状态</div>
        </div>
        {logs.length === 0 && (
          <div className="px-5 py-12 text-center text-text-muted text-sm">暂无请求记录</div>
        )}
        {logs.map((l) => (
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
            <div className="w-[100px] font-mono text-[11px] text-text-muted">
              {(l.total_input_tokens ?? 0) || (l.input_tokens || 0) + (l.output_tokens || 0) + (l.cache_r || 0) + (l.cache_w || 0)}
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
                  isErr(l) ? 'text-danger' : 'text-success'
                }`}
                style={{ background: isErr(l) ? 'rgba(248,113,113,0.15)' : 'rgba(52,211,153,0.15)' }}
              >
                {l.status || (l.error ? 'ERR' : '200')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const Dropdown = ({ value, onChange, options, labelOf }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3.5 py-2 bg-bg-card border border-border rounded-lg flex items-center gap-2 text-[12px] text-text-secondary min-w-[120px] hover:border-text-tertiary transition-colors"
      >
        <span className={value === 'all' ? '' : 'text-text-primary'}>{labelOf(value)}</span>
        <ChevronDown size={12} className={`text-text-muted ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 min-w-full w-max bg-bg-card border border-border rounded-lg shadow-lg py-1 max-h-72 overflow-auto">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt)
                setOpen(false)
              }}
              className={`w-full flex items-center justify-between gap-4 px-3 py-1.5 text-[12px] text-left hover:bg-bg-elevated ${
                opt === value ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              <span>{labelOf(opt)}</span>
              {opt === value && <Check size={12} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
