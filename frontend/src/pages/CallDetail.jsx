import { Link, useParams } from 'react-router-dom';
import { useApi } from '../api/useApi';
import Badge from '../components/Badge';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import { fmtDate, fmtDuration } from '../utils/format';

export default function CallDetail() {
  const { id } = useParams();
  const { data, loading, error } = useApi(`/api/admin/calls/${id}`);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const call = data.data;
  const actionItems = Array.isArray(call.ai_action_items) ? call.ai_action_items : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Call from {call.caller_phone || 'Unknown'}</h1>
          <div className="muted">
            {call.business_name ? `${call.business_name} · ` : ''}
            {fmtDate(call.created_at)} · {fmtDuration(call.duration_seconds)} ·{' '}
            <span className="mono">{call.twilio_call_sid}</span>
          </div>
        </div>
        <Link to="/calls" className="btn">
          ← All calls
        </Link>
      </div>

      <div className="card-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>AI analysis</h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Outcome</dt>
              <dd>
                <Badge value={call.call_outcome} />
              </dd>
            </div>
            <div>
              <dt>Intent</dt>
              <dd>
                <Badge value={call.ai_intent} />
              </dd>
            </div>
            <div>
              <dt>Sentiment</dt>
              <dd>
                <Badge value={call.ai_sentiment} />
              </dd>
            </div>
            <div>
              <dt>Summary</dt>
              <dd>{call.ai_summary || <span className="muted">Not analyzed yet</span>}</dd>
            </div>
          </dl>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Action items</h2>
          </div>
          {actionItems.length > 0 ? (
            <ul className="action-list">
              {actionItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No action items extracted.</p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Transcript</h2>
          {call.recording_url && (
            <a href={call.recording_url} target="_blank" rel="noreferrer">
              Recording ↗
            </a>
          )}
        </div>
        {call.transcript ? (
          <pre className="transcript">{call.transcript}</pre>
        ) : (
          <p className="muted">No transcript available for this call.</p>
        )}
      </div>
    </div>
  );
}
