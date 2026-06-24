import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import Pagination from '../components/Pagination';
import { fmtDate } from '../utils/format';

const TABS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: '', label: 'All' },
];

export default function Leads() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('new');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(null);

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (status) params.set('status', status);
  const { data, loading, error, refetch } = useApi(`/api/admin/leads?${params}`);

  async function convertLead(lead) {
    setBusy(lead.id);
    setActionError(null);
    try {
      const res = await api(`/api/admin/leads/${lead.id}/convert`, { method: 'POST' });
      navigate(`/clients/${res.data.client.id}`);
    } catch (err) {
      setActionError(err.message);
      setBusy(null);
    }
  }

  async function dismissLead(lead) {
    setBusy(lead.id);
    setActionError(null);
    try {
      await api(`/api/admin/leads/${lead.id}/dismiss`, { method: 'POST' });
      refetch();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Leads</h1>
          <div className="muted">Prospects from the public site. Convert a lead to a client, then send a checkout link.</div>
        </div>
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
                  <th>Business</th>
                  <th>Contact</th>
                  <th>Interest</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No leads here yet.
                    </td>
                  </tr>
                )}
                {data.data.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="row-title">{lead.business_name}</div>
                      {lead.message && <div className="muted small">{lead.message}</div>}
                    </td>
                    <td>
                      <div>{lead.email}</div>
                      {lead.phone && <div className="muted small">{lead.phone}</div>}
                    </td>
                    <td>
                      <Badge value={lead.plan_interest || 'unsure'} />
                    </td>
                    <td>
                      <Badge value={lead.status} />
                    </td>
                    <td>{fmtDate(lead.created_at)}</td>
                    <td>
                      {lead.status !== 'converted' && lead.status !== 'dismissed' && (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy === lead.id}
                            onClick={() => convertLead(lead)}
                          >
                            {busy === lead.id ? 'Working…' : 'Convert'}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busy === lead.id}
                            onClick={() => dismissLead(lead)}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                      {lead.status === 'converted' && lead.converted_client_id && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => navigate(`/clients/${lead.converted_client_id}`)}
                        >
                          View client
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
