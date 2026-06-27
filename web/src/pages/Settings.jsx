import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, setToken } from '../lib/api'

export default function Settings() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })
  const [token, setTokenInput] = useState('')
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState(null)

  const saveM = useMutation({
    mutationFn: (d) => updateSettings(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setErr(null)
      // 如果用户设置了新 token，保存到 localStorage 以便后续请求通过 auth
      if (token) {
        setToken(token)
      }
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e) => setErr(e.message),
  })

  const handleSave = () => {
    const data = {}
    if (token.trim()) data.gateway_token = token.trim()
    saveM.mutate(data)
  }

  const configured = settings?.has_token ?? false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">系统设置</h1>
        <p className="text-[13px] text-text-muted mt-1">
          配置网关全局认证令牌
        </p>
      </div>

      {!configured && (
        <div className="px-4 py-3 rounded-xl bg-warning/10 border border-warning/30 text-[13px] text-warning">
          网关令牌尚未配置，请先设置一个令牌后再使用管理面板。
        </div>
      )}

      <div className="max-w-xl space-y-5 rounded-xl bg-bg-card border border-border p-6">
        <div>
          <div className="text-[12px] text-text-secondary mb-1.5">
            Gateway Token <span className="text-text-muted">（用于登录管理面板的密码）</span>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={isLoading ? '加载中…' : configured ? '输入新令牌（留空则不修改）' : '设置网关令牌'}
            className="w-full px-3 py-2.5 bg-bg border border-border rounded-lg text-sm font-mono text-text-primary focus:outline-none focus:border-primary"
          />
          {!isLoading && configured && (
            <div className="text-[11px] text-text-muted mt-1">
              当前：{settings?.gateway_token || '（未设置）'}
            </div>
          )}
        </div>

        {err && <div className="text-[12px] text-danger">{err}</div>}

        {saved && (
          <div className="text-[12px] text-success">
            已保存
            {configured && '（如修改了当前使用的令牌，请重新登录）'}
          </div>
        )}

        <div className="flex gap-2.5 pt-1">
          <button
            onClick={handleSave}
            disabled={saveM.isPending || !token.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-fg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saveM.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}