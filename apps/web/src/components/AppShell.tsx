import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  MapPinned,
  Settings,
  Truck,
} from 'lucide-react';

const itens = [
  { to: '/', label: 'Control Tower', icon: Activity },
  { to: '/planejamento', label: 'Planejamento', icon: MapPinned },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Truck size={18} /></div>
          <div>
            <strong>COPELI</strong>
            <span>Control Tower</span>
          </div>
        </div>

        <nav className="nav">
          {itens.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>Operação logística</span>
          <small>React + TypeScript</small>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
