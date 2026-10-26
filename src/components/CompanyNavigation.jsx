import { NavLink, Link } from 'react-router-dom'
import { COMPANY_PERIODS } from '../utils/company'

export default function CompanyNavigation({ driver = false, rides = true }) {
  return <nav className="company-navigation" aria-label={driver ? 'Driver tools' : 'Store owner tools'}>
    {(driver ? [['/driver', 'Delivery Dispatch'], ...(rides ? [['/driver/rides', 'Ride assignments & route']] : [])]
      : [['/store-owner', 'Business overview'], ['/store-owner/manage', 'My store & inventory'], ['/store-owner/assignments', 'Store assignments']])
      .map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}
  </nav>
}

export function CompanyPeriods({ value, onChange }) {
  return <div className="company-periods" role="group" aria-label="Analytics period">
    {COMPANY_PERIODS.map(([key, label]) => <button key={key} type="button"
      aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>
}

export function CompanyMetrics({ items }) {
  return <dl className="company-metrics">{items.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

export function CompanyAccessDenied() {
  return <section className="panel"><h1>Company account required</h1>
    <p>This page requires the matching company-owned role. Partner and administrator accounts use their own dashboards.
      Contact Admin if your account needs access.</p><Link to="/profile">Back to account</Link></section>
}
