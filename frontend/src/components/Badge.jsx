const TONE_BY_VALUE = {
  // success
  active: 'success',
  trialing: 'success',
  succeeded: 'success',
  synced: 'success',
  resolved: 'success',
  completed: 'success',
  connected: 'success',
  published: 'success',
  positive: 'success',
  // warning
  trial: 'warn',
  pending: 'warn',
  in_progress: 'warn',
  voicemail: 'warn',
  open: 'warn',
  paused: 'warn',
  neutral: 'warn',
  busy: 'warn',
  high: 'warn',
  // danger
  past_due: 'danger',
  canceled: 'danger',
  unpaid: 'danger',
  failed: 'danger',
  error: 'danger',
  missed: 'danger',
  churned: 'danger',
  suspended: 'danger',
  rejected: 'danger',
  disconnected: 'danger',
  negative: 'danger',
  urgent: 'danger',
};

export default function Badge({ value }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  const tone = TONE_BY_VALUE[String(value)] || 'neutral';
  return <span className={`badge badge-${tone}`}>{String(value).replace(/_/g, ' ')}</span>;
}
