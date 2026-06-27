import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Server, Shuffle, ListTree, Settings as SettingsIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '../lib/utils'
import ThemeToggle from './ThemeToggle'

const items = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/providers', label: '提供商', icon: Server },
  { to: '/mappings', label: '模型映射', icon: Shuffle },
  { to: '/logs', label: '请求日志', icon: ListTree },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const itemRefs = useRef({})
  const navRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ top: 0, height: 0, opacity: 0 })

  const activeIndex = items.findIndex(it => {
    if (it.end) return location.pathname === it.to
    return location.pathname.startsWith(it.to)
  })

  useEffect(() => {
    if (activeIndex < 0 || !navRef.current) {
      setIndicatorStyle(s => ({ ...s, opacity: 0 }))
      return
    }
    const el = itemRefs.current[items[activeIndex].to]
    if (el && navRef.current) {
      const navRect = navRef.current.getBoundingClientRect()
      const itemRect = el.getBoundingClientRect()
      setIndicatorStyle({
        top: itemRect.top - navRect.top,
        height: itemRect.height,
        opacity: 1
      })
    }
  }, [activeIndex, location.pathname, collapsed])

  return (
    <div className="min-h-screen flex bg-bg text-text-primary">
      <aside className={cn(
        'fixed left-0 top-0 h-full z-30',
        'w-60 bg-bg-card border-r border-border p-5 flex flex-col gap-6',
        'transition-transform duration-300 ease-out',
        collapsed ? '-translate-x-full' : 'translate-x-0'
      )}>
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="Office Gateway" className="w-7 h-7 shrink-0" />
          <div>
            <div className="text-[15px] font-semibold whitespace-nowrap">Office Gateway</div>
            <div className="text-[11px] text-text-muted whitespace-nowrap">控制台</div>
          </div>
        </div>
        <nav ref={navRef} className="flex flex-col gap-1 relative">
          <div
            className="absolute left-0 w-0.5 bg-primary rounded-r transition-all duration-300 ease-out pointer-events-none"
            style={indicatorStyle}
          />
          {items.map((it) => (
            <div key={it.to} ref={(el) => { itemRefs.current[it.to] = el }}>
              <NavLink
                to={it.to}
                end={it.end}
                className={({ isActive }) => cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm',
                  'transition-all duration-150 ease-out',
                  isActive
                    ? 'bg-bg-elevated text-text-primary'
                    : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary'
                )}
              >
                <it.icon size={16} className="shrink-0" />
                <span>{it.label}</span>
              </NavLink>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-border">
            <div
              ref={(el) => { itemRefs.current['/settings'] = el }}
            >
              <NavLink
                to="/settings"
                className={({ isActive }) => cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm',
                  'transition-all duration-150 ease-out',
                  isActive
                    ? 'bg-bg-elevated text-text-primary'
                    : 'text-text-secondary hover:bg-bg-elevated/50 hover:text-text-primary'
                )}
              >
                <SettingsIcon size={16} className="shrink-0" />
                <span>系统设置</span>
              </NavLink>
            </div>
          </div>
        </nav>
        <div className="flex-1" />
        <div className="text-[11px] flex flex-col gap-1">
          <div className="text-success flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block shrink-0" />运行中
          </div>
          <div className="text-text-muted whitespace-nowrap">v3.0 · port 4000</div>
        </div>
      </aside>

      <div className={cn(
        'flex-1 flex flex-col',
        'transition-[margin-left] duration-300 ease-out',
        collapsed ? 'ml-0' : 'ml-60'
      )}>
        <div className="flex justify-between items-center px-10 pt-6">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg',
              'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              'transition-colors duration-150'
            )}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <ThemeToggle />
        </div>
        <main className="flex-1 px-10 pb-10 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
