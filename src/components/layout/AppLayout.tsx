import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  HandCoins,
  Receipt,
  ScrollText,
  AlertTriangle,
  Coins,
  Landmark,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/emprestimos', label: 'Empréstimos', icon: HandCoins },
  { to: '/pagamentos', label: 'Pagamentos', icon: Receipt },
  { to: '/extrato', label: 'Extrato', icon: ScrollText },
  { to: '/cobrancas', label: 'Cobranças', icon: AlertTriangle },
  { to: '/reporte-bdm', label: 'Reporte BdM', icon: Landmark },
];

export function AppLayout() {
  return (
    <div className="min-h-screen flex bg-parchment-50 dark:bg-ink-950 text-ink-900 dark:text-parchment-100">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-ink-100 dark:border-ink-700 bg-white/60 dark:bg-ink-900/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-6 h-16 border-b border-ink-100 dark:border-ink-700">
          <div className="h-8 w-8 rounded-lg bg-brass-500 flex items-center justify-center">
            <Coins className="h-4 w-4 text-ink-950" />
          </div>
          <div>
            <p className="font-display font-bold leading-tight">LUMEO</p>
            <p className="text-[10px] tracking-widest uppercase text-ink-400">Capital</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brass-500/15 text-brass-600 dark:text-brass-400'
                    : 'text-ink-500 dark:text-parchment-200/70 hover:bg-ink-100 dark:hover:bg-ink-800'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 text-[11px] text-ink-400 border-t border-ink-100 dark:border-ink-700">
          Motor de juros: capitalização por aniversário.
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }} className="min-h-16 h-auto py-3 border-b border-ink-100 dark:border-ink-700 flex items-center justify-between px-4 md:px-8 bg-white/60 dark:bg-ink-900/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="md:hidden h-7 w-7 rounded-lg bg-brass-500 flex items-center justify-center">
              <Coins className="h-4 w-4 text-ink-950" />
            </div>
            <p className="font-display font-semibold text-sm md:text-base">Gestão de Microcrédito</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Menu inferior no telemóvel (estilo app bancária) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-20 flex overflow-x-auto border-t border-ink-100 dark:border-ink-700 bg-white/95 dark:bg-ink-900/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex-1 min-w-[64px] flex flex-col items-center gap-1 px-2 py-2 text-[10px] font-medium',
                isActive ? 'text-brass-600 dark:text-brass-400' : 'text-ink-500 dark:text-parchment-200/70'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span className="whitespace-nowrap">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
