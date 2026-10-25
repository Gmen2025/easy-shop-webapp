import { NavLink } from 'react-router-dom'
import { ADMIN_TOOLS } from '../utils/adminDashboard'

export default function AdminNavigation() {
  return <nav className="admin-tool-nav" aria-label="Admin tools">
    <NavLink to="/admin" end>Dashboard</NavLink>
    {ADMIN_TOOLS.map(([title, , to]) => <NavLink key={title} to={to}>{title}</NavLink>)}
  </nav>
}
