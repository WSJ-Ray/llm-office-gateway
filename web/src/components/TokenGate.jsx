import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { setToken, getToken, getSetupStatus } from '../lib/api'

export default function TokenGate({ children }) {
  const [token, setLocal] = useState(getToken() || '')
  const location = useLocation()
  const { data: status, isLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    retry: false,
  })

  // 未完成加载时直接渲染 children（避免闪烁）
  if (isLoading) return children

  // 后端未配置令牌 → 引导到设置页（仅当不在设置页时重定向）
  if (status && !status.configured && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />
  }

  if (token) return children

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-[400px] bg-bg-card border border-border rounded-xl p-8 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Office Gateway</h1>
          <p className="text-sm text-text-muted mt-1">输入网关令牌以访问控制台</p>
        </div>
        <input
          id="token-input"
          type="password"
          placeholder="Gateway Token"
          className="w-full px-3 py-2 bg-bg border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = e.currentTarget.value.trim()
              if (v) { setToken(v); setLocal(v) }
            }
          }}
        />
        <button
          onClick={() => {
            const v = document.getElementById('token-input').value.trim()
            if (v) { setToken(v); setLocal(v) }
          }}
          className="w-full py-2 bg-primary text-primary-fg rounded-md text-sm font-medium hover:opacity-90"
        >
          进入
        </button>
        <div className="text-[11px] text-text-tertiary text-center">令牌在管理面板的「系统设置」中配置</div>
      </div>
    </div>
  )
}