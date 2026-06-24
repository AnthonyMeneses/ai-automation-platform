import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import Pagination from '../components/Pagination';
import { fmtDate } from '../utils/format';

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: '', label: 'All' },
];

export default function Support() {
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState(null);
  const [resolving, setResolving] = useState(null);

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (status) params.set('status', status);
  const { data, loading, error, refetch } = useApi(`/api/admin/support-tickets?${params}`);

  async function resolveTicket(ticket) {
    setResolving(ticket.id);
    setActionError(null);
    try {
      await api(`/api/admin/clients/${ticket.client_id}/support-tickets/${ticket.id}/resolve`, {
        method: 'POST',
      });
      refetch();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Support queue</h1>
        <div className="tab-row">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={status === tab.value ? 'tab active' : 'tab'}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorMessage message={actionError} />
      {error && <ErrorMessage message={error} />}
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Client</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Nothing here. Nice.
                    </td>
                  </tr>
                )}
                {data.data.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <div className="row-title">{ticket.subject}</div>
                      <div className="muted small">{ticket.message}</div>
                    </td>
                    <td>
                      <Link to={`/clients/${ticket.client_id}`}>{ticket.business_name}</Link>
                    </td>
                    <td>
                      <Badge value={ticket.priority} />
                    </td>
                    <td>
                      <Badge value={ticket.status} />
                    </td>
                    <td>{fmtDate(ticket.created_at)}</td>
                    <td>
                      {ticket.status !== 'resolved' && (
                        <button
                          type="button"
                          className="btn"
                          disabled={resolving === ticket.id}
                          onClick={() => resolveTicket(ticket)}
                        >
                          {resolving === ticket.id ? 'Resolving…' : 'Resolve'}
                        </button>
                      )}
                    </td>
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
