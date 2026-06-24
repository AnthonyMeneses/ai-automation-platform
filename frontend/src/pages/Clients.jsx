import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import Pagination from '../components/Pagination';
import { fmtDate, fmtMoney } from '../utils/format';

const EMPTY_FORM = { business_name: '', email: '', phone: '' };

export default function Clients() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (query) params.set('search', query);
  const { data, loading, error, refetch } = useApi(`/api/admin/clients?${params}`);

  function onSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function onCreate(event) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api('/api/admin/clients', {
        method: 'POST',
        body: {
          business_name: form.business_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
        },
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setPage(1);
      setQuery('');
      refetch();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Clients</h1>
        <div className="header-actions">
          <form className="search-form" onSubmit={onSearch}>
            <input
              type="search"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn">
              Search
            </button>
          </form>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add client'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="panel inline-form" onSubmit={onCreate}>
          <div className="panel-header">
            <h2>New client</h2>
          </div>
          <div className="form-grid">
            <label>
              Business name
              <input
                type="text"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                required
                minLength={2}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </label>
            <label>
              Phone (optional)
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
          </div>
          <ErrorMessage message={formError} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create client'}
            </button>
          </div>
        </form>
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
                  <th>Business</th>
                  <th>Tier</th>
                  <th>Subscription</th>
                  <th>MRR</th>
                  <th>Last payment</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No clients found.
                    </td>
                  </tr>
                )}
                {data.data.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link to={`/clients/${client.id}`} className="row-title">
                        {client.business_name}
                      </Link>
                      <div className="muted small">{client.email}</div>
                    </td>
                    <td>
                      <Badge value={client.subscription_tier} />
                    </td>
                    <td>
                      <Badge value={client.subscription_status} />
                    </td>
                    <td>{fmtMoney(client.amount_cents)}</td>
                    <td>
                      <Badge value={client.last_payment_status} />
                    </td>
                    <td>{fmtDate(client.created_at)}</td>
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
