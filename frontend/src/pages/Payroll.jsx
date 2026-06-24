import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import { fmtDate } from '../utils/format';

export default function Payroll() {
  const { data, loading, error, refetch } = useApi('/api/admin/payroll/status');
  const [syncing, setSyncing] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  async function syncNow(clientId, businessName) {
    setSyncing(clientId);
    setSyncError(null);
    setLastResult(null);
    try {
      const res = await api(`/api/admin/clients/${clientId}/payroll/sync`, { method: 'POST' });
      setLastResult({ businessName, ...res.data });
      refetch();
    } catch (err) {
      setSyncError(`${businessName}: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const connections = data.data;
  const errored = connections.filter((c) => c.api_status === 'error');

  return (
    <div>
      <h1>Payroll</h1>

      {errored.length > 0 && (
        <div className="alert alert-error">
          {errored.length} payroll connection{errored.length > 1 ? 's' : ''} in an error state —
          review below.
        </div>
      )}
      <ErrorMessage message={syncError} />
      {lastResult && (
        <div className={`alert ${lastResult.status === 'synced' ? 'alert-success' : 'alert-error'}`}>
          <strong>{lastResult.businessName}:</strong> sync {lastResult.status}
          {lastResult.employee_count !== undefined &&
            ` · ${lastResult.employee_count} employees`}
          {lastResult.errors?.length > 0 && ` · ${lastResult.errors.join('; ')}`}
          {lastResult.warnings?.length > 0 && (
            <div className="small">Warnings: {lastResult.warnings.join('; ')}</div>
          )}
        </div>
      )}

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Service</th>
              <th>Status</th>
              <th>Last sync</th>
              <th>Last error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No payroll connections configured.
                </td>
              </tr>
            )}
            {connections.map((conn) => (
              <tr key={conn.id}>
                <td>
                  <Link to={`/clients/${conn.client_id}`} className="row-title">
                    {conn.business_name}
                  </Link>
                </td>
                <td>{conn.payroll_service.toUpperCase()}</td>
                <td>
                  <Badge value={conn.api_status} />
                </td>
                <td>{fmtDate(conn.last_sync_at)}</td>
                <td className="muted small">{conn.last_error || '—'}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    disabled={syncing !== null}
                    onClick={() => syncNow(conn.client_id, conn.business_name)}
                  >
                    {syncing === conn.client_id ? 'Syncing…' : 'Sync now'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
