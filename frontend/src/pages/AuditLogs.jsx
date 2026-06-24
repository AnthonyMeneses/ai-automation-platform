import { useState } from 'react';
import { useApi } from '../api/useApi';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import Pagination from '../components/Pagination';
import { fmtDate } from '../utils/format';

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [filters, setFilters] = useState({ action: '', resourceType: '' });

  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (filters.action) params.set('action', filters.action);
  if (filters.resourceType) params.set('resource_type', filters.resourceType);
  const { data, loading, error } = useApi(`/api/admin/audit-logs?${params}`);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters({ action: action.trim(), resourceType: resourceType.trim() });
  }

  return (
    <div>
      <div className="page-header">
        <h1>Audit logs</h1>
        <form className="filter-row" onSubmit={applyFilters}>
          <input
            type="text"
            placeholder="Action (e.g. viewed_client)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
          <input
            type="text"
            placeholder="Resource type (e.g. client)"
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value)}
          />
          <button type="submit" className="btn">
            Filter
          </button>
        </form>
      </div>

      {error && <ErrorMessage message={error} />}
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No audit entries match.
                    </td>
                  </tr>
                )}
                {data.data.map((log) => (
                  <tr key={log.id}>
                    <td>{fmtDate(log.created_at)}</td>
                    <td>{log.admin_email || '—'}</td>
                    <td className="mono">{log.action}</td>
                    <td>
                      {log.resource_type ? (
                        <>
                          <span>{log.resource_type}</span>
                          {log.resource_id && (
                            <div className="muted small mono">{log.resource_id}</div>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.pagination.page}
            limit={data.pagination.limit}
            total={data.pagination.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
