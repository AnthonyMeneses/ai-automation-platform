import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api/useApi';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import Pagination from '../components/Pagination';
import { fmtDate, fmtDuration } from '../utils/format';

const OUTCOMES = ['completed', 'missed', 'voicemail', 'failed', 'busy', 'in_progress'];

export default function Calls() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('client_id') || '';
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (clientId) params.set('client_id', clientId);
  if (outcome) params.set('outcome', outcome);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const { data, loading, error } = useApi(`/api/admin/calls?${params}`);

  return (
    <div>
      <div className="page-header">
        <h1>Phone calls</h1>
        <div className="filter-row">
          <select
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All outcomes</option>
            {OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            aria-label="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            aria-label="To date"
          />
        </div>
      </div>

      {clientId && (
        <p className="muted">
          Filtered to one client. <Link to="/calls">Clear filter</Link>
        </p>
      )}

      {error && <ErrorMessage message={error} />}
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Caller</th>
                  <th>Duration</th>
                  <th>Outcome</th>
                  <th>AI intent</th>
                  <th>Sentiment</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No calls match these filters.
                    </td>
                  </tr>
                )}
                {data.data.map((call) => (
                  <tr key={call.id}>
                    <td>{call.business_name || '—'}</td>
                    <td>
                      <Link to={`/calls/${call.id}`} className="row-title">
                        {call.caller_phone || 'Unknown'}
                      </Link>
                    </td>
                    <td>{fmtDuration(call.duration_seconds)}</td>
                    <td>
                      <Badge value={call.call_outcome} />
                    </td>
                    <td>
                      <Badge value={call.ai_intent} />
                    </td>
                    <td>
                      <Badge value={call.ai_sentiment} />
                    </td>
                    <td>{fmtDate(call.created_at)}</td>
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
