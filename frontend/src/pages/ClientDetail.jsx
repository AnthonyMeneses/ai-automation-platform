import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import { fmtDate, fmtDuration, fmtMoney } from '../utils/format';

export default function ClientDetail() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useApi(`/api/admin/clients/${id}`);
  const [actionError, setActionError] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [billing, setBilling] = useState({ tier: 'pro', link: null, error: null, busy: false });

  async function createCheckoutLink() {
    setBilling((b) => ({ ...b, busy: true, error: null, link: null }));
    try {
      const res = await api(`/api/admin/clients/${id}/checkout`, {
        method: 'POST',
        body: { tier: billing.tier },
      });
      setBilling((b) => ({ ...b, busy: false, link: res.data.url }));
    } catch (err) {
      setBilling((b) => ({ ...b, busy: false, error: err.message }));
    }
  }

  async function openBillingPortal() {
    setBilling((b) => ({ ...b, busy: true, error: null, link: null }));
    try {
      const res = await api(`/api/admin/clients/${id}/billing-portal`, { method: 'POST' });
      setBilling((b) => ({ ...b, busy: false }));
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      setBilling((b) => ({ ...b, busy: false, error: err.message }));
    }
  }

  async function runAction(name, fn) {
    setBusyAction(name);
    setActionError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const { client, subscription, payments, website, recent_calls: calls, payroll, tickets } = data.data;
  const siteUrl = website?.published_url || (website?.domain ? `https://${website.domain}` : null);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{client.business_name}</h1>
          <div className="muted">
            {client.email}
            {client.phone ? ` · ${client.phone}` : ''}
            {client.twilio_phone_number ? ` · AI line ${client.twilio_phone_number}` : ''}
          </div>
        </div>
        <div className="badge-row">
          <Badge value={client.subscription_tier} />
          <Badge value={client.status} />
        </div>
      </div>

      <ErrorMessage message={actionError} />

      <div className="card-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Subscription</h2>
          </div>
          {subscription ? (
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge value={subscription.status} />
                </dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{fmtMoney(subscription.amount_cents, subscription.currency)} / period</dd>
              </div>
              <div>
                <dt>Current period ends</dt>
                <dd>{fmtDate(subscription.current_period_end)}</dd>
              </div>
              <div>
                <dt>Cancels at period end</dt>
                <dd>{subscription.cancel_at_period_end ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">No subscription on file.</p>
          )}
          <div className="panel-footer">
            <select
              value={billing.tier}
              onChange={(e) => setBilling((b) => ({ ...b, tier: e.target.value }))}
              aria-label="Plan tier"
            >
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <button
              type="button"
              className="btn btn-primary"
              disabled={billing.busy}
              onClick={createCheckoutLink}
            >
              {billing.busy ? 'Working…' : 'Create checkout link'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={billing.busy || !client.stripe_customer_id}
              onClick={openBillingPortal}
            >
              Billing portal
            </button>
          </div>
          {billing.error && <div className="alert alert-error inset">{billing.error}</div>}
          {billing.link && (
            <div className="billing-link">
              <span className="muted small">Send this checkout link to the client:</span>
              <div className="billing-link-row">
                <input
                  type="text"
                  readOnly
                  value={billing.link}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(billing.link)}
                >
                  Copy
                </button>
                <a className="btn" href={billing.link} target="_blank" rel="noreferrer">
                  Open
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Website</h2>
            {website && (
              <button
                type="button"
                className="btn"
                disabled={busyAction === 'publish'}
                onClick={() =>
                  runAction('publish', () =>
                    api(`/api/admin/clients/${id}/website/publish`, {
                      method: 'POST',
                      body: { published: !website.published },
                    })
                  )
                }
              >
                {busyAction === 'publish' ? 'Working…' : website.published ? 'Unpublish' : 'Publish'}
              </button>
            )}
          </div>
          {website ? (
            <dl className="detail-list">
              <div>
                <dt>Domain</dt>
                <dd>
                  {siteUrl ? (
                    <a href={siteUrl} target="_blank" rel="noreferrer">
                      {website.domain}
                    </a>
                  ) : (
                    <span className="muted">not set</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Template</dt>
                <dd>{website.template_id}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge value={website.published ? 'published' : 'pending'} />
                </dd>
              </div>
              <div>
                <dt>Last published</dt>
                <dd>{fmtDate(website.last_published_at)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">No website yet.</p>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Payroll</h2>
            {payroll && (
              <button
                type="button"
                className="btn"
                disabled={busyAction === 'sync'}
                onClick={() =>
                  runAction('sync', () =>
                    api(`/api/admin/clients/${id}/payroll/sync`, { method: 'POST' })
                  )
                }
              >
                {busyAction === 'sync' ? 'Syncing…' : 'Sync now'}
              </button>
            )}
          </div>
          {payroll ? (
            <dl className="detail-list">
              <div>
                <dt>Service</dt>
                <dd>{payroll.service.toUpperCase()}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge value={payroll.status} />
                </dd>
              </div>
              <div>
                <dt>Last sync</dt>
                <dd>{fmtDate(payroll.last_sync_at)}</dd>
              </div>
              {payroll.last_error && (
                <div>
                  <dt>Last error</dt>
                  <dd className="danger-text">{payroll.last_error}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="muted">No payroll connection.</p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Payment history</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Paid</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No payments yet.
                </td>
              </tr>
            )}
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="mono">{payment.stripe_invoice_id || '—'}</td>
                <td>{fmtMoney(payment.amount_cents, payment.currency)}</td>
                <td>
                  <Badge value={payment.status} />
                  {payment.failure_reason && (
                    <div className="muted small">{payment.failure_reason}</div>
                  )}
                </td>
                <td>{fmtDate(payment.paid_at)}</td>
                <td>{fmtDate(payment.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Recent calls</h2>
          <Link to={`/calls?client_id=${id}`}>All calls →</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Caller</th>
              <th>Duration</th>
              <th>Outcome</th>
              <th>AI intent</th>
              <th>Preview</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No calls yet.
                </td>
              </tr>
            )}
            {calls.map((call) => (
              <tr key={call.id}>
                <td>
                  <Link to={`/calls/${call.id}`}>{call.caller_phone || 'Unknown'}</Link>
                </td>
                <td>{fmtDuration(call.duration_seconds)}</td>
                <td>
                  <Badge value={call.call_outcome} />
                </td>
                <td>
                  <Badge value={call.ai_intent} />
                </td>
                <td className="muted small preview-cell">{call.transcript_preview || '—'}</td>
                <td>{fmtDate(call.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Support tickets</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Opened</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No tickets.
                </td>
              </tr>
            )}
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>
                  <div className="row-title">{ticket.subject}</div>
                  <div className="muted small">{ticket.message}</div>
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
                      disabled={busyAction === `resolve-${ticket.id}`}
                      onClick={() =>
                        runAction(`resolve-${ticket.id}`, () =>
                          api(`/api/admin/clients/${id}/support-tickets/${ticket.id}/resolve`, {
                            method: 'POST',
                          })
                        )
                      }
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
