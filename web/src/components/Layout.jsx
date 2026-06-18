import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Server, Shuffle, ListTree } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const items = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/providers', label: '提供商', icon: Server },
  { to: '/mappings', label: '模型映射', icon: Shuffle },
  { to: '/logs', label: '请求日志', icon: ListTree }
]

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-bg text-text-primary">
      <aside className="w-60 bg-bg-card border-r border-border p-5 flex flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="Office Gateway" className="w-7 h-7" />
          <div>
            <div className="text-[15px] font-semibold">Office Gateway</div>
            <div className="text-[11px] text-text-muted">控制台</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm ${
                  isActive ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`
              }
            >
              <it.icon size={16} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="text-[11px] flex flex-col gap-1">
          <div className="text-success flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />运行中
          </div>
          <div className="text-text-muted">v3.0 · port 4000</div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <div className="flex justify-end px-10 pt-6">
          <ThemeToggle />
        </div>
        <main className="flex-1 px-10 pb-10 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
