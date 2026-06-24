import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

const FEATURES = [
  {
    icon: '☎',
    title: 'AI Phone Answering',
    body: 'Never miss a call. AI answers, transcribes, and tells you exactly what each caller needs — with intent and sentiment.',
  },
  {
    icon: '◳',
    title: 'Website Builder',
    body: 'Launch a polished site in minutes with AI-generated copy, then publish to your own domain.',
  },
  {
    icon: '⟳',
    title: 'Payroll Bridge',
    body: 'Sync ADP or Gusto with a validation layer that catches errors before they ever reach payroll.',
  },
  {
    icon: '$',
    title: 'Billing & Invoices',
    body: 'Stripe-powered subscriptions, automatic invoice history, and instant failed-payment alerts.',
  },
  {
    icon: '✦',
    title: 'Support Desk',
    body: 'Every customer request lands in one prioritized queue, so nothing slips through the cracks.',
  },
  {
    icon: '◆',
    title: 'One Dashboard',
    body: 'Calls, sites, payroll, billing, and support — your whole back office in a single secure view.',
  },
];

const STEPS = [
  { title: 'Tell us about your business', body: 'Share your business and pick the plan that fits. Takes about a minute.' },
  { title: 'We set up your AI back office', body: 'Phone line, website, payroll, and billing — configured and tested for you.' },
  { title: 'Focus on your customers', body: 'We handle the busywork in the background while you grow.' },
];

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 99,
    tagline: 'For solo owners getting their first AI line live.',
    features: ['AI phone answering (1 line)', 'Website builder (1 site)', 'Call transcripts & analytics', 'Email support'],
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 199,
    tagline: 'For growing teams that want the full back office.',
    features: [
      'Everything in Starter',
      'Up to 3 phone lines',
      'Payroll sync (ADP / Gusto)',
      'Failed-payment alerts',
      'Priority support',
    ],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 399,
    tagline: 'For established businesses with custom needs.',
    features: [
      'Everything in Pro',
      'Unlimited phone lines & sites',
      'Dedicated onboarding',
      'Custom integrations',
      'SLA + phone support',
    ],
    popular: false,
  },
];

const EMPTY = { business_name: '', email: '', phone: '', plan: '', message: '', company_website: '' };

export default function Landing() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [error, setError] = useState(null);
  const formRef = useRef(null);

  function choosePlan(planId) {
    setForm((f) => ({ ...f, plan: planId }));
    if (formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth' });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.error) || 'Something went wrong. Please try again.');
      }
      setStatus('done');
      setForm(EMPTY);
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-container lp-nav-inner">
          <div className="lp-brand">
            <span className="lp-brand-mark" /> Switchboard
          </div>
          <div className="lp-nav-links">
            <a href="#features" className="lp-hide-sm">Features</a>
            <a href="#pricing" className="lp-hide-sm">Pricing</a>
            <Link to="/login" className="lp-nav-ghost">Admin login</Link>
            <a href="#get-started" className="lp-btn lp-btn-primary lp-btn-sm">Get started</a>
          </div>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-container lp-hero-inner">
          <span className="lp-eyebrow">AI automation for small business</span>
          <h1>
            The AI back office that <em>runs the busywork</em> for your small business.
          </h1>
          <p>
            Answer every call, build your website, sync payroll, and handle billing — all from one
            dashboard, powered by AI. You focus on customers; Switchboard handles the rest.
          </p>
          <div className="lp-hero-cta">
            <a href="#get-started" className="lp-btn lp-btn-primary">Get started</a>
            <a href="#pricing" className="lp-btn lp-btn-ghost" style={{ color: '#eef2f7', borderColor: 'rgba(255,255,255,0.25)' }}>
              See pricing
            </a>
          </div>
          <div className="lp-hero-trust">No credit card to get started · Set up in days, not weeks</div>
        </div>
      </header>

      <section className="lp-section" id="features">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2>Everything your back office needs</h2>
            <p>Five tools that usually take five vendors — unified, automated, and watched over by AI.</p>
          </div>
          <div className="lp-grid">
            {FEATURES.map((f) => (
              <div className="lp-card" key={f.title}>
                <div className="lp-card-icon" aria-hidden="true">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-alt">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2>Up and running in three steps</h2>
            <p>No technical setup on your end. We handle the wiring.</p>
          </div>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div className="lp-step" key={s.title}>
                <div className="lp-step-num">{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="pricing">
        <div className="lp-container">
          <div className="lp-section-head">
            <h2>Simple, honest pricing</h2>
            <p>Pick a plan to get started. Change or cancel anytime from your billing portal.</p>
          </div>
          <div className="lp-pricing">
            {PLANS.map((plan) => (
              <div className={plan.popular ? 'lp-price-card popular' : 'lp-price-card'} key={plan.id}>
                {plan.popular && <div className="lp-badge">Most popular</div>}
                <div className="lp-price-name">{plan.name}</div>
                <div className="lp-price-amount">
                  ${plan.price}
                  <span>/mo</span>
                </div>
                <div className="lp-price-tagline">{plan.tagline}</div>
                <ul className="lp-price-features">
                  {plan.features.map((feat) => (
                    <li key={feat}>
                      <span className="lp-check" aria-hidden="true">✓</span> {feat}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={plan.popular ? 'lp-btn lp-btn-primary lp-btn-block' : 'lp-btn lp-btn-ghost lp-btn-block'}
                  onClick={() => choosePlan(plan.id)}
                >
                  Choose {plan.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-alt" id="get-started" ref={formRef}>
        <div className="lp-container">
          <div className="lp-section-head">
            <h2>Get started</h2>
            <p>Tell us about your business and we’ll reach out to set everything up.</p>
          </div>
          <div className="lp-form-wrap">
            {status === 'done' ? (
              <div className="lp-thanks">
                <div className="lp-thanks-mark" aria-hidden="true">✓</div>
                <h3>Thanks — we’ve got it!</h3>
                <p>We’ll reach out shortly to get your AI back office set up.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                {status === 'error' && error && <div className="lp-form-error">{error}</div>}

                <div className="lp-field">
                  <label htmlFor="business_name">Business name</label>
                  <input
                    id="business_name"
                    type="text"
                    required
                    minLength={2}
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  />
                </div>

                <div className="lp-field-row">
                  <div className="lp-field">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="lp-field">
                    <label htmlFor="phone">Phone (optional)</label>
                    <input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="lp-field">
                  <label htmlFor="plan">Plan you’re interested in</label>
                  <select
                    id="plan"
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                  >
                    <option value="">Not sure yet</option>
                    <option value="starter">Starter — $99/mo</option>
                    <option value="pro">Pro — $199/mo</option>
                    <option value="enterprise">Enterprise — $399/mo</option>
                  </select>
                </div>

                <div className="lp-field">
                  <label htmlFor="message">Anything we should know? (optional)</label>
                  <textarea
                    id="message"
                    rows={3}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </div>

                {/* Honeypot — hidden from real users */}
                <div className="lp-hp" aria-hidden="true">
                  <label htmlFor="company_website">Company website</label>
                  <input
                    id="company_website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.company_website}
                    onChange={(e) => setForm({ ...form, company_website: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  className="lp-btn lp-btn-primary lp-btn-block"
                  disabled={status === 'submitting'}
                >
                  {status === 'submitting' ? 'Sending…' : 'Request setup'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-brand">
            <span className="lp-brand-mark" /> Switchboard
          </div>
          <div className="lp-footer-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login">Admin login</Link>
          </div>
          <div style={{ fontSize: 13, color: '#7f8b9c' }}>© {new Date().getFullYear()} Switchboard</div>
        </div>
      </footer>
    </div>
  );
}
