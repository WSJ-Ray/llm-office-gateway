import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Pencil, Trash2 } from 'lucide-react'
import { get, post, del } from '../lib/api'
import ProviderForm from '../components/ProviderForm'

export default function Providers() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['providers'], queryFn: () => get('/admin/providers') })
  const [show, setShow] = useState(false)
  const [edit, setEdit] = useState(null)
  const [testResult, setTestResult] = useState(null)

  const delM = useMutation({
    mutationFn: (id) => del(`/admin/providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] })
  })
  const toggleM = useMutation({
    mutationFn: ({ id, enabled }) => put(`/admin/providers/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] })
  })
  const testM = useMutation({
    mutationFn: (id) => post(`/admin/providers/${id}/test`),
    onSuccess: (r) => setTestResult({ id: r.id, ok: true, ...r }),
    onError: (e) => setTestResult({ ok: false, error: e.message })
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">提供商配置</h1>
          <p className="text-[13px] text-text-muted mt-1">管理多个 API 端点，按模型路由到不同上游</p>
        </div>
        <button
          onClick={() => {
            setEdit(null)
            setShow(true)
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-fg rounded-lg text-sm font-medium hover:opacity-90"
        >
          <Plus size={14} />
          新增提供商
        </button>
      </div>

      <div className="rounded-xl bg-bg-card border border-border overflow-hidden">
        <div className="flex items-center px-5 py-3.5 bg-bg-elevated text-[11px] font-semibold text-text-muted">
          <div className="w-[180px]">名称</div>
          <div className="w-[120px]">格式</div>
          <div className="flex-1">BASE URL</div>
          <div className="w-20">启用</div>
          <div className="w-20">默认</div>
          <div className="w-[160px]">操作</div>
        </div>
        {(data?.data || []).map((p) => (
          <div key={p.id} className="flex items-center px-5 py-4 border-t border-border text-sm">
            <div className="w-[180px] flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-success' : 'bg-text-tertiary'}`} />
              <span className="font-medium">{p.name}</span>
            </div>
            <div className="w-[120px]">
              <span className="px-2.5 py-0.5 bg-bg-elevated border border-border rounded-full font-mono text-[11px] text-text-secondary">
                {p.format}
              </span>
            </div>
            <div className="flex-1 font-mono text-[12px] text-text-secondary truncate">{p.base_url}</div>
            <div className="w-20">
              <button
                onClick={() => toggleM.mutate({ id: p.id, enabled: !p.enabled })}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                  p.enabled
                    ? 'text-success border-success/30 bg-success/10'
                    : 'text-text-muted border-border bg-bg-elevated'
                }`}
                title={p.enabled ? '点击停用' : '点击启用'}
              >
                {p.enabled ? '已启用' : '已停用'}
              </button>
            </div>
            <div className="w-20">
              {p.is_default ? (
                <span className="px-2 py-0.5 rounded text-primary text-[10px] font-semibold" style={{ background: 'rgba(99,102,241,0.15)' }}>
                  默认
                </span>
              ) : (
                <span className="text-text-tertiary">—</span>
              )}
            </div>
            <div className="w-[160px] flex gap-1.5">
              <button
                onClick={() => testM.mutate(p.id)}
                className="p-1.5 bg-bg-elevated border border-border rounded-md hover:border-primary"
                title="测试"
              >
                <Play size={13} className="text-text-secondary" />
              </button>
              <button
                onClick={() => {
                  setEdit(p)
                  setShow(true)
                }}
                className="p-1.5 bg-bg-elevated border border-border rounded-md hover:border-primary"
                title="编辑"
              >
                <Pencil size={13} className="text-text-secondary" />
              </button>
              <button
                onClick={() => {
                  if (confirm('删除提供商？相关映射将一并失效。')) delM.mutate(p.id)
                }}
                className="p-1.5 bg-bg-elevated border border-border rounded-md hover:border-danger"
                title="删除"
              >
                <Trash2 size={13} className="text-danger" />
              </button>
            </div>
          </div>
        ))}
        {testResult && (
          <div className="px-5 py-3 border-t border-border text-[12px]">
            {testResult.ok ? (
              <span className="text-success">
                ✓ 连接成功，发现 {testResult.models} 个模型（{testResult.latency_ms}ms）
              </span>
            ) : (
              <span className="text-danger">✗ 连接失败：{testResult.error}</span>
            )}
          </div>
        )}
      </div>

      {show && <ProviderForm provider={edit} onClose={() => setShow(false)} />}
    </div>
  )
}
