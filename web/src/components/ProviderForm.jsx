import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Zap, Boxes, Hash, MessageSquare, MessagesSquare, Sparkles, Copy, Info } from 'lucide-react'
import { post, put } from '../lib/api'

const FORMATS = [
  { value: 'anthropic', label: 'Anthropic 原生', Icon: Hash, hint: '已透传' },
  { value: 'openai_chat', label: 'OpenAI Chat', Icon: MessageSquare, hint: '需翻译' },
  { value: 'openai_responses', label: 'OpenAI Responses', Icon: MessagesSquare, hint: '需翻译' },
  { value: 'vertex', label: 'Vertex AI (Gemini)', Icon: Sparkles, hint: '需翻译' }
]

export default function ProviderForm({ provider, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!provider
  const [form, setForm] = useState({
    name: provider?.name || '',
    format: provider?.format || 'anthropic',
    base_url: provider?.base_url || '',
    api_key: provider?.api_key || '',
    enabled: provider?.enabled ?? true,
    is_default: provider?.is_default ?? false,
    extra_config: provider?.extra_config || {}
  })
  const [models, setModels] = useState(null)
  const [fetching, setFetching] = useState(false)
  const [err, setErr] = useState(null)

  const saveM = useMutation({
    mutationFn: (data) =>
      isEdit ? put(`/admin/providers/${provider.id}`, data) : post('/admin/providers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      onClose()
    },
    onError: (e) => setErr(e.message)
  })

  const fetchModels = async () => {
    setFetching(true)
    setModels(null)
    setErr(null)
    try {
      const r = await post('/admin/providers/preview-models', form)
      setModels(r)
    } catch (e) {
      setModels({ ok: false, error: e.message })
    }
    setFetching(false)
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-[720px] max-h-[90vh] overflow-y-auto bg-bg-card border border-border rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">{isEdit ? '编辑提供商' : '新增提供商'}</h2>
            <p className="text-[12px] text-text-muted mt-1">
              配置一个 API 端点，网关可按模型路由到该提供商
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md bg-bg-elevated hover:bg-bg">
            <X size={14} className="text-text-secondary" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <div>
            <div className="text-[12px] font-medium text-text-secondary mb-2">端点格式</div>
            <div className="grid grid-cols-4 gap-2">
              {FORMATS.map((f) => {
                const active = form.format === f.value
                return (
                  <button
                    key={f.value}
                    onClick={() => set('format', f.value)}
                    className={`p-3.5 rounded-[10px] text-left border-2 ${
                      active
                        ? 'bg-bg-elevated border-primary'
                        : 'bg-bg border-transparent hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <f.Icon size={15} className={active ? 'text-primary' : 'text-text-secondary'} />
                        <span className="text-[13px] font-semibold">{f.label}</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          active ? 'bg-primary' : 'border border-text-tertiary'
                        }`}
                      >
                        {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div className="text-[11px] text-text-muted">{f.hint}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="名称" value={form.name} onChange={(v) => set('name', v)} placeholder="例如：DeepSeek" />
            <Field label="超时（秒）" value="120" onChange={() => {}} disabled />
            <Field label="Base URL" value={form.base_url} onChange={(v) => set('base_url', v)} placeholder="https://api.deepseek.com/anthropic" mono />
            <Field label="API Key" value={form.api_key} onChange={(v) => set('api_key', v)} placeholder="sk-..." mono secret />
          </div>

          <div>
            <div className="text-[12px] font-medium text-text-secondary mb-1.5">
              高级配置（JSON，可选）
            </div>
            <div className="text-[11px] text-text-muted mb-1.5">
              Vertex: {'{project, region}'} · OpenAI: {'{organization}'}
            </div>
            <div className="p-3.5 bg-bg border border-border rounded-lg font-mono text-[12px] text-text-tertiary">
              {'{ }'}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <div className="text-[12px] font-medium text-text-secondary">上游模型预览</div>
              <div className="text-[11px] text-text-muted">点击按钮使用当前配置拉取模型列表</div>
            </div>
            <div className="flex justify-end mb-2">
              <button
                onClick={fetchModels}
                disabled={fetching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-elevated border border-border text-sm font-medium hover:border-primary disabled:opacity-50"
              >
                <Boxes size={13} className="text-primary" />
                {fetching ? '获取中…' : '获取模型列表'}
              </button>
            </div>
            {models && (
              <div className="p-3.5 bg-bg border border-border rounded-lg space-y-2.5">
                {models.ok ? (
                  <>
                    <div className="flex items-center gap-2 text-[12px] text-success">
                      <span className="w-2 h-2 rounded-full bg-success" />
                      连接成功 · 共 {models.models.length} 个模型
                      {models.latency_ms != null && (
                        <span className="text-text-muted font-mono">· {models.latency_ms}ms</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {models.models.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-elevated border border-border font-mono text-[11px]"
                        >
                          <Copy
                            size={10}
                            className="text-text-muted cursor-pointer"
                            onClick={() => navigator.clipboard?.writeText(m)}
                          />
                          {m}
                        </span>
                      ))}
                      {models.models.length > 3 && (
                        <span className="px-2.5 py-1 text-[11px] text-text-muted">
                          + {models.models.length - 3} more
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[12px] text-danger">连接失败：{models.error}</div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-text-muted">
              <Info size={11} />
              这些 ID 来自上游 API 实时返回，模型映射页可直接选用。
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Sw
              label="启用此提供商"
              desc="关闭后网关将不再路由到该提供商"
              on={form.enabled}
              onChange={(v) => set('enabled', v)}
            />
            <Sw
              label="设为默认提供商"
              desc="当模型未在映射表中匹配时，回退到该提供商"
              on={form.is_default}
              onChange={(v) => set('is_default', v)}
            />
            {(form.format === 'anthropic' || form.format === 'url_adaptive') && (
              <Sw
                label="启用 Prompt 缓存"
                desc="在 system prompt 中注入 cache_control 标记，利用上游内容缓存降低延迟和费用"
                on={!!form.extra_config.enable_prompt_caching}
                onChange={(v) => setForm((f) => ({ ...f, extra_config: { ...f.extra_config, enable_prompt_caching: v } }))}
              />
            )}
          </div>

          {err && <div className="text-[12px] text-danger">保存失败：{err}</div>}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={fetchModels}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-bg-elevated border border-border text-sm font-medium hover:border-warning"
          >
            <Zap size={14} className="text-warning" />测试连接
          </button>
          <div className="flex gap-2.5">
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary">
              取消
            </button>
            <button
              onClick={() => saveM.mutate(form)}
              disabled={!form.name || !form.base_url}
              className="px-4 py-2 rounded-lg bg-primary text-primary-fg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, value, onChange, placeholder, mono, secret, disabled }) => (
  <div>
    <div className="text-[12px] font-medium text-text-secondary mb-1.5">{label}</div>
    <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-bg border border-border ${disabled ? 'opacity-50' : ''}`}>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`flex-1 bg-transparent text-[13px] focus:outline-none ${mono ? 'font-mono' : 'font-sans'} ${
          value ? 'text-text-primary' : 'text-text-tertiary'
        }`}
      />
    </div>
  </div>
)

const Sw = ({ label, desc, on, onChange }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1">
      <div className="text-[13px] text-text-primary">{label}</div>
      <div className="text-[11px] text-text-muted">{desc}</div>
    </div>
    <button
      onClick={() => onChange(!on)}
      className={`w-9 h-5 rounded-full border border-border ${on ? 'bg-primary' : 'bg-bg-elevated'}`}
    >
      <div
        className={`w-3.5 h-3.5 rounded-full bg-white mt-[1px] transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  </div>
)
