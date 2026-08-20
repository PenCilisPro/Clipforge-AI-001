import { useEffect, useState } from 'react'
import { NavLink, Link, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  PlusCircle,
  FolderOpen,
  Film,
  CalendarDays,
  Library,
  Sparkles,
  Shapes,
  FileSpreadsheet,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { SocialAccount } from '@/lib/types'
import { classNames } from '@/lib/format'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/create', label: 'Create Project', icon: PlusCircle },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/clips', label: 'Clips', icon: Film },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/media', label: 'Media Library', icon: Library },
  { to: '/ai', label: 'AI', icon: Sparkles },
  { to: '/patterns', label: 'Pattern Library', icon: Shapes },
  { to: '/csv-import', label: 'CSV Import', icon: FileSpreadsheet },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={classNames(
        'inline-block h-2 w-2 rounded-full',
        connected ? 'bg-emerald-400' : 'bg-zinc-600',
      )}
    />
  )
}

export default function Layout() {
  const { user, signOut } = useAuth()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    supabase
      .from('social_accounts')
      .select('*')
      .then(({ data }) => setAccounts((data as SocialAccount[]) ?? []))
  }, [])

  const isConnected = (platform: string) =>
    accounts.some((a) => a.platform === platform && a.status === 'connected')

  const sidebar = (
    <div className="flex h-full w-60 flex-col border-r border-surface-700 bg-surface-900">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
          <Film className="h-4.5 w-4.5 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight">
          ClipForge <span className="text-brand-500">AI</span>
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              classNames(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-100',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-surface-700 px-5 py-4 text-xs text-zinc-400">
        <div className="mb-1 flex items-center gap-2">
          <ConnectionDot connected={isConnected('youtube')} />
          YouTube {isConnected('youtube') ? 'Connected' : 'Not connected'}
        </div>
        <div className="flex items-center gap-2">
          <ConnectionDot connected={isConnected('tiktok')} />
          TikTok {isConnected('tiktok') ? 'Connected' : 'Not connected'}
        </div>
        <div className="mt-2.5 pt-2 border-t border-surface-800 flex items-center justify-between">
          <Link
            to="/privacy"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Shield className="h-3 w-3 text-brand-400" />
            Privacy Policy
          </Link>
          <span className="text-[10px] text-zinc-600">v2.4.0</span>
        </div>
      </div>

      <div className="border-t border-surface-700 px-3 py-3">
        <div className="flex items-center justify-between gap-2 px-2">
          <span className="truncate text-xs text-zinc-500">{user?.email}</span>
          <button onClick={() => void signOut()} className="btn-ghost !px-2" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden md:block">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 z-50">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-surface-700 bg-surface-900 px-4 py-3 md:hidden">
          <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-ghost !px-2">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="font-bold">
            ClipForge <span className="text-brand-500">AI</span>
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
