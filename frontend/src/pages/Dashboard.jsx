import { Link } from 'react-router-dom';
import { useApi } from '../api/useApi';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import { fmtDate, fmtMoney } from '../utils/format';

export default function Dashboard() {
  const { data, loading, error } = useApi('/api/admin/dashboard/stats');

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const {
    totals,
    recent_calls: recentCalls,
    recent_failed_payments: failedPayments,
    recent_leads: recentLeads = [],
  } = data.data;

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stat-grid">
        <StatCard
          label="New leads"
          value={totals.new_leads}
          tone={totals.new_leads > 0 ? 'warn' : 'neutral'}
        />
        <StatCard label="Clients" value={totals.total_clients} />
        <StatCard label="Active subscriptions" value={totals.active_subscriptions} tone="success" />
        <StatCard
          label="Open tickets"
          value={totals.open_tickets}
          tone={totals.open_tickets > 0 ? 'warn' : 'neutral'}
        />
        <StatCard label="Calls (7 days)" value={totals.calls_last_7_days} />
        <StatCard
          label="Failed payments (30d)"
          value={totals.failed_payments_30d}
          tone={totals.failed_payments_30d > 0 ? 'danger' : 'neutral'}
        />
        <StatCard
          label="Payroll errors"
          value={totals.payroll_errors}
          tone={totals.payroll_errors > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {recentLeads.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2>New leads to follow up</h2>
            <Link to="/leads">View all →</Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Email</th>
                <th>Interest</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link to="/leads" className="row-title">
                      {lead.business_name}
                    </Link>
                  </td>
                  <td>{lead.email}</td>
                  <td>
                    <Badge value={lead.plan_interest || 'unsure'} />
                  </td>
                  <td>{fmtDate(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h2>Recent calls</h2>
          <Link to="/calls">View all →</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Caller</th>
              <th>Outcome</th>
              <th>AI intent</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {recentCalls.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No calls yet.
                </td>
              </tr>
            )}
            {recentCalls.map((call) => (
              <tr key={call.id}>
                <td>{call.business_name || '—'}</td>
                <td>{call.caller_phone || '—'}</td>
                <td>
                  <Badge value={call.call_outcome} />
                </td>
                <td>
                  <Badge value={call.ai_intent} />
                </td>
                <td>{fmtDate(call.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {failedPayments.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2>Recent failed payments</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {failedPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.business_name}</td>
                  <td>{fmtMoney(payment.amount_cents, payment.currency)}</td>
                  <td>{payment.failure_reason || '—'}</td>
                  <td>{fmtDate(payment.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
