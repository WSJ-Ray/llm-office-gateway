import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ArrowRight, RefreshCw, ChevronDown, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react'
import { get, post, put, del } from '../lib/api'

// Claude Office 客户端仅识别含 sonnet / opus / haiku 的模型 ID
const CLIENT_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet' },
  { id: 'claude-opus-4-5-20250929', label: 'Opus' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
]
const GROUP_ORDER = ['sonnet', 'haiku', 'opus']
const familyOf = (clientModel = '') => {
  const m = String(clientModel).toLowerCase()
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('opus')) return 'opus'
  return 'other'
}
const labelOf = (fam) => CLIENT_MODELS.find((c) => c.id.includes(fam))?.label || fam

export default function Mappings() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['mappings'], queryFn: () => get('/admin/mappings') })
  const { data: provs } = useQuery({ queryKey: ['providers'], queryFn: () => get('/admin/providers') })
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [form, setForm] = useState({ id: null, provider_id: 0, client_model: '', upstream_model: '' })
  const [err, setErr] = useState(null)
  const [models, setModels] = useState(null)
  const [loadingModels, setLoadingModels] = useState(false)

  const saveM = useMutation({
    mutationFn: (d) => (d.id ? put(`/admin/mappings/${d.id}`, d) : post('/admin/mappings', d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mappings'] })
      setOpen(false)
    },
    onError: (e) => setErr(e.message)
  })
  const delM = useMutation({
    mutationFn: (id) => del(`/admin/mappings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mappings'] })
  })
  const toggleM = useMutation({
    mutationFn: ({ id, enabled }) => put(`/admin/mappings/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mappings'] })
  })
  // 调整顺序：对调两个相邻行的 priority
  const swapM = useMutation({
    mutationFn: async ({ a, b }) => {
      await put(`/admin/mappings/${a.id}`, { priority: b.priority })
      await put(`/admin/mappings/${b.id}`, { priority: a.priority })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mappings'] })
  })

  const groups = useMemo(() => {
    const out = {}
    for (const fam of GROUP_ORDER) out[fam] = []
    out.other = []
    for (const m of data?.data || []) {
      const fam = familyOf(m.client_model)
      ;(out[fam] || out.other).push(m)
    }
    for (const fam of GROUP_ORDER) {
      out[fam].sort((a, b) => (a.priority - b.priority) || (a.id - b.id))
    }
    return out
  }, [data])

  const startNew = (presetClientModel) => {
    setForm({
      id: null,
      provider_id: (provs?.data || [])[0]?.id || 0,
      client_model: presetClientModel || CLIENT_MODELS[0].id,
      upstream_model: ''
    })
    setErr(null)
    setModels(null)
    setOpen(true)
    if ((provs?.data || [])[0]?.id) fetchModels((provs?.data || [])[0].id)
  }

  const startEdit = (m) => {
    setForm({ id: m.id, provider_id: m.provider_id, client_model: m.client_model, upstream_model: m.upstream_model })
    setErr(null)
    setModels(null)
    setOpen(true)
    fetchModels(m.provider_id)
  }

  const fetchModels = async (pid) => {
    if (!pid) return
    setLoadingModels(true)
    setModels(null)
    try {
      const r = await get(`/admin/providers/${pid}/models`)
      setModels(r)
    } catch (e) {
      setModels({ ok: false, error: e.message, models: [] })
    }
    setLoadingModels(false)
  }

  const onProviderChange = (pid) => {
    setForm({ ...form, provider_id: pid })
    setModels(null)
    fetchModels(pid)
  }

  const moveRow = (rows, idx, dir) => {
    const j = idx + dir
    if (j < 0 || j >= rows.length) return
    const a = rows[idx], b = rows[j]
    // 同一 priority 的情况：把 b 的 priority 设为 a 的 +1 后再调
    if (a.priority === b.priority) {
      swapM.mutate({ a: { ...a, priority: a.priority + 1 }, b })
    } else {
      swapM.mutate({ a, b })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">模型映射</h1>
          <p className="text-[13px] text-text-muted mt-1">
            客户端模型 → 上游模型路由；同组内按顺序自动故障转移
          </p>
        </div>
        <button
          onClick={() => startNew()}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-fg rounded-lg text-sm font-medium"
        >
          <Plus size={14} />新增映射
        </button>
      </div>

      {GROUP_ORDER.map((fam) => {
        const rows = groups[fam]
        const isOpen = !collapsed[fam]
        const enabledCount = rows.filter((r) => r.enabled).length
        return (
          <div key={fam} className="rounded-xl bg-bg-card border border-border overflow-hidden">
            <button
              onClick={() => setCollapsed((c) => ({ ...c, [fam]: isOpen }))}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-bg-elevated hover:bg-bg transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {isOpen ? <ChevronDown size={16} className="text-text-secondary" /> : <ChevronRight size={16} className="text-text-secondary" />}
                <span className="text-[14px] font-semibold">{labelOf(fam)}</span>
                <span className="text-[11px] text-text-muted font-mono">
                  {rows[0]?.client_model || '（无）'}
                </span>
                <span className="text-[11px] text-text-muted">
                  · {rows.length} 个候选 {enabledCount < rows.length && <span className="text-warning">（{rows.length - enabledCount} 停用）</span>}
                </span>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => startNew(CLIENT_MODELS.find((c) => c.id.includes(fam))?.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-primary hover:bg-bg"
                >
                  <Plus size={11} />添加到本组
                </button>
              </div>
            </button>

            {isOpen && (
              <>
                <div className="flex items-center px-5 py-2.5 text-[10px] font-semibold text-text-muted border-t border-border">
                  <div className="w-[40px]">顺序</div>
                  <div className="w-[140px]">提供商</div>
                  <div className="flex-1">上游模型</div>
                  <div className="w-20">启用</div>
                  <div className="w-[140px] text-right pr-2">操作</div>
                </div>
                {rows.length === 0 && (
                  <div className="px-5 py-6 text-center text-[12px] text-text-muted border-t border-border">
                    暂无候选，点击右上「添加到本组」配置上游
                  </div>
                )}
                {rows.map((m, idx) => (
                  <div key={m.id} className="flex items-center px-5 py-3 border-t border-border text-sm">
                    <div className="w-[40px] flex flex-col gap-0.5">
                      <button
                        onClick={() => moveRow(rows, idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 text-text-muted hover:text-primary disabled:opacity-30"
                        title="上移（提高优先级）"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        onClick={() => moveRow(rows, idx, 1)}
                        disabled={idx === rows.length - 1}
                        className="p-0.5 text-text-muted hover:text-primary disabled:opacity-30"
                        title="下移（降低优先级）"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                    <div className="w-[140px] flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${m.enabled ? 'bg-success' : 'bg-text-tertiary'}`} />
                      <span className="text-[12px] truncate">{m.provider_name}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] text-text-tertiary font-mono w-[28px] shrink-0">#{idx + 1}</span>
                      <ArrowRight size={11} className="text-text-tertiary shrink-0" />
                      <span className="font-mono text-[12px] text-text-primary truncate">{m.upstream_model}</span>
                    </div>
                    <div className="w-20">
                      <button
                        onClick={() => toggleM.mutate({ id: m.id, enabled: !m.enabled })}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          m.enabled
                            ? 'text-success border-success/30 bg-success/10'
                            : 'text-text-muted border-border bg-bg-elevated'
                        }`}
                        title={m.enabled ? '点击停用' : '点击启用'}
                      >
                        {m.enabled ? '已启用' : '已停用'}
                      </button>
                    </div>
                    <div className="w-[140px] flex gap-1.5 justify-end">
                      <button
                        onClick={() => startEdit(m)}
                        className="p-1.5 bg-bg-elevated border border-border rounded-md"
                        title="编辑"
                      >
                        <Pencil size={12} className="text-text-secondary" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('删除该候选？')) delM.mutate(m.id)
                        }}
                        className="p-1.5 bg-bg-elevated border border-border rounded-md"
                        title="删除"
                      >
                        <Trash2 size={12} className="text-danger" />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )
      })}

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div
            className="w-[560px] bg-bg-card border border-border rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-border">
              <h2 className="text-lg font-semibold">{form.id ? '编辑映射' : '新增映射'}</h2>
              <p className="text-[11px] text-text-muted mt-1">
                新增的候选将追加到该客户端模型组队尾
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <div className="text-[12px] text-text-secondary mb-1.5">客户端模型（Claude Office 仅识别以下三种）</div>
                <div className="flex gap-2">
                  {CLIENT_MODELS.map((m) => {
                    const active = form.client_model === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setForm({ ...form, client_model: m.id })}
                        className={`flex-1 px-3 py-2.5 rounded-lg border text-left ${
                          active ? 'bg-bg-elevated border-primary' : 'bg-bg border-border hover:border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-semibold">{m.label}</span>
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                              active ? 'bg-primary border-primary' : 'border-text-tertiary'
                            }`}
                          >
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-text-muted mt-0.5 truncate">{m.id}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-text-secondary mb-1.5">提供商</div>
                <select
                  value={form.provider_id}
                  onChange={(e) => onProviderChange(+e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg border border-border rounded-lg text-sm text-text-primary"
                >
                  {(provs?.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[12px] text-text-secondary">上游模型</div>
                  <button
                    type="button"
                    onClick={() => fetchModels(form.provider_id)}
                    disabled={loadingModels || !form.provider_id}
                    className="flex items-center gap-1 text-[11px] text-primary hover:opacity-80 disabled:opacity-40"
                  >
                    <RefreshCw size={11} className={loadingModels ? 'animate-spin' : ''} />
                    {loadingModels ? '获取中' : '刷新上游模型'}
                  </button>
                </div>
                <input
                  value={form.upstream_model}
                  onChange={(e) => setForm({ ...form, upstream_model: e.target.value })}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-2.5 bg-bg border border-border rounded-lg text-sm font-mono text-text-primary"
                />
                <div className="mt-2">
                  {models
                    ? models.ok
                      ? (
                        <div className="flex flex-wrap gap-1.5">
                          {models.models.length === 0 && (
                            <span className="text-[11px] text-text-muted">上游返回 0 个模型，请手填</span>
                          )}
                          {models.models.map((mid) => {
                            const active = form.upstream_model === mid
                            return (
                              <button
                                key={mid}
                                type="button"
                                onClick={() => setForm({ ...form, upstream_model: mid })}
                                className={`px-2.5 py-1 rounded-md border font-mono text-[11px] ${
                                  active
                                    ? 'bg-primary text-primary-fg border-primary'
                                    : 'bg-bg-elevated text-text-secondary border-border hover:border-primary'
                                }`}
                              >
                                {mid}
                              </button>
                            )
                          })}
                        </div>
                      )
                      : <span className="text-[11px] text-danger">获取失败：{models.error}（可手填）</span>
                    : loadingModels
                      ? <span className="text-[11px] text-text-muted">正在拉取上游模型…</span>
                      : null}
                </div>
              </div>
              {err && <div className="text-[12px] text-danger">{err}</div>}
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-border">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-text-secondary">
                取消
              </button>
              <button
                onClick={() => saveM.mutate({ ...form, enabled: true })}
                disabled={!form.client_model || !form.upstream_model}
                className="px-4 py-2 rounded-lg bg-primary text-primary-fg text-sm font-medium disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
