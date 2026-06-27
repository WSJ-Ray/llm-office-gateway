import { useState, useRef, useEffect, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, ChevronRight, Check, ArrowRight } from 'lucide-react'
import { get } from '../lib/api'

const fmtTime = (ts) => (ts ? String(ts).slice(11, 19) : '—')
const fmtMs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2) + 's')
const fmtFullTs = (ts) => (ts ? String(ts).slice(0, 16) : '—')
const tokenPct = (part, total) => (total ? Math.round((part / total) * 100) : 0)
const streamLabel = (s) => (s ? '流式' : '非流式')

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
  const [expandedIds, setExpandedIds] = useState({})
  const toggleExpand = (id) => setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
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
          <div className="w-[28px] shrink-0" />
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
        {logs.map((l) => {
          const expanded = !!expandedIds[l.id]
          const inputTokens = l.input_tokens || 0
          const outputTokens = l.output_tokens || 0
          const tokenTotal = inputTokens + outputTokens
          const inputPct = tokenPct(inputTokens, tokenTotal)
          const outputPct = tokenPct(outputTokens, tokenTotal)
          const hasCacheR = (l.cache_r || 0) > 0
          const hasCacheW = (l.cache_w || 0) > 0
          const hasCache = hasCacheR || hasCacheW

          return (
            <Fragment key={l.id}>
              <div
                className={`flex items-center px-5 py-3.5 border-t border-border text-sm cursor-pointer transition-colors duration-200 ${
                  expanded ? 'bg-bg-elevated' : ''
                }`}
                onClick={() => toggleExpand(l.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(l.id) } }}
              >
                <div className="w-[28px] shrink-0 flex items-center justify-start">
                  {expanded
                    ? <ChevronDown size={14} className="text-text-secondary" />
                    : <ChevronRight size={14} className="text-text-tertiary" />
                  }
                </div>
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
                  {inputTokens} / {outputTokens}
                </div>
                <div className="w-[100px] font-mono text-[11px] text-text-muted">
                  {(l.total_input_tokens ?? 0) || inputTokens + outputTokens + (l.cache_r || 0) + (l.cache_w || 0)}
                </div>
                <div
                  className={`w-[110px] font-mono text-[11px] ${
                    hasCache ? 'text-success' : 'text-text-muted'
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

              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-8 py-4 bg-bg border-t border-border">
                  <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-[12px]">
                    {/* 基本信息 */}
                    <div className="col-span-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider pt-1">
                      基本信息
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-16 shrink-0">Request ID</span>
                      <span className="font-mono text-text-primary font-medium">#{l.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-16 shrink-0">时间</span>
                      <span className="font-mono text-text-primary">{fmtFullTs(l.ts)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-16 shrink-0">模式</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          color: l.stream ? 'var(--primary)' : 'var(--text-secondary)',
                          background: l.stream ? 'rgba(99,102,241,0.12)' : 'var(--bg-elevated)',
                        }}
                      >
                        {streamLabel(l.stream)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-16 shrink-0">状态码</span>
                      <span className={`font-mono font-medium ${isErr(l) ? 'text-danger' : 'text-success'}`}>
                        {l.status || (l.error ? 'ERR' : '200')}
                      </span>
                    </div>

                    {/* 模型路由 */}
                    <div className="col-span-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider pt-2">
                      模型路由
                    </div>
                    <div className="col-span-2 flex items-center gap-2 font-mono text-text-primary">
                      <span className="px-2 py-0.5 rounded bg-bg-elevated">{l.client_model}</span>
                      <ArrowRight size={11} className="text-text-tertiary" />
                      <span className="px-2 py-0.5 rounded bg-bg-elevated">{l.upstream_model}</span>
                    </div>

                    {/* 性能指标 */}
                    <div className="col-span-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider pt-2">
                      性能指标
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-20 shrink-0">首字延迟 (TTFT)</span>
                      <span className="font-mono text-text-primary font-medium">{fmtMs(l.ttft_ms)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted w-20 shrink-0">总耗时</span>
                      <span className="font-mono text-text-primary font-medium">{fmtMs(l.duration_ms)}</span>
                    </div>

                    {/* Token 详情 */}
                    <div className="col-span-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider pt-2">
                      Token 详情
                    </div>
                    <div className="col-span-2 space-y-2">
                      <div className="flex items-center gap-6">
                        <span className="text-text-muted">
                          输入 <span className="ml-1.5 font-mono text-text-primary font-medium">{inputTokens}</span>
                        </span>
                        <span className="text-text-muted">
                          输出 <span className="ml-1.5 font-mono text-text-primary font-medium">{outputTokens}</span>
                        </span>
                        <span className="text-text-muted">
                          总量 <span className="ml-1.5 font-mono text-text-primary font-medium">{tokenTotal}</span>
                        </span>
                      </div>
                      {tokenTotal > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-bg-elevated">
                            <div
                              style={{ width: `${inputPct}%` }}
                              className="h-full bg-primary rounded-full transition-all duration-500"
                            />
                          </div>
                          <span className="text-[10px] text-text-muted font-mono shrink-0">
                            入 {inputPct}% / 出 {outputPct}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 缓存统计 */}
                    <div className="col-span-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider pt-2">
                      缓存统计
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${hasCacheR ? 'bg-success' : 'bg-text-tertiary'}`} />
                        <span className="text-text-muted">Cache Read</span>
                        <span className="font-mono text-text-primary font-medium">{l.cache_r || 0}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${hasCacheW ? 'bg-warning' : 'bg-text-tertiary'}`} />
                        <span className="text-text-muted">Cache Write</span>
                        <span className="font-mono text-text-primary font-medium">{l.cache_w || 0}</span>
                      </span>
                      {!hasCache && <span className="text-[11px] text-text-muted">无缓存命中</span>}
                    </div>

                    {/* 错误信息 */}
                    {l.error && (
                      <>
                        <div className="col-span-2 text-[10px] font-semibold text-danger uppercase tracking-wider pt-2">
                          错误信息
                        </div>
                        <div
                          className="col-span-2 font-mono text-[11px] text-danger leading-relaxed px-3 py-2 rounded-md max-h-24 overflow-y-auto"
                          style={{
                            background: 'rgba(248,113,113,0.06)',
                            border: '1px solid rgba(248,113,113,0.15)',
                          }}
                        >
                          {l.error}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Fragment>
          )
        })}
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
