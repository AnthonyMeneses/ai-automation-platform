import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Leads' },
  { to: '/clients', label: 'Clients' },
  { to: '/calls', label: 'Calls' },
  { to: '/payroll', label: 'Payroll' },
  { to: '/support', label: 'Support' },
  { to: '/audit-logs', label: 'Audit Logs' },
];

export default function Layout() {
  const { admin, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-dot" /> AI Automation
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="muted">{admin?.email}</span>
          <button type="button" className="btn" onClick={logout}>
            Log out
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
