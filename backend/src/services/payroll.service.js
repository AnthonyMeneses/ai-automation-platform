const crypto = require('crypto');
const config = require('../config');
const { AppError } = require('../utils/errors');
const { withRetry } = require('../utils/retry');
const { decryptSecret } = require('../utils/crypto');
const payrollModel = require('../models/payroll.model');
const claudeService = require('./claude.service');
const { logger } = require('../utils/logger');

const MIN_HOURLY_RATE_CENTS = 725; // federal minimum wage floor
const MAX_PERIOD_HOURS = 120; // hard sanity cap per pay period
const WARN_PERIOD_HOURS = 90;

// HMAC request signing for outbound payroll submissions so the receiving
// service can verify integrity and freshness.
function signPayload(payload) {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', config.payroll.signingSecret || 'dev-signing-secret')
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');
  return { 'X-Timestamp': timestamp, 'X-Signature': signature };
}

// Retries transient upstream failures (5xx/429/network); 4xx pass through.
async function fetchWithRetry(url, options) {
  return withRetry(async () => {
    const response = await fetch(url, options);
    if (response.status >= 500 || response.status === 429) {
      const err = new Error(`upstream responded ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return response;
  });
}

// ---------------------------------------------------------------------------
// Deterministic validation — the gate. The AI review below is advisory only
// and can never approve a batch these rules reject.
// ---------------------------------------------------------------------------

function deterministicValidate(data) {
  const errors = [];
  const warnings = [];

  if (!data || !Array.isArray(data.employees) || data.employees.length === 0) {
    return { errors: ['Payroll data contains no employees'], warnings };
  }

  let computedTotal = 0;
  data.employees.forEach((emp, index) => {
    const label = emp.name || emp.id || `employee ${index + 1}`;

    if (typeof emp.hours !== 'number' || Number.isNaN(emp.hours) || emp.hours < 0) {
      errors.push(`${label}: hours must be a non-negative number`);
    } else if (emp.hours > MAX_PERIOD_HOURS) {
      errors.push(`${label}: ${emp.hours} hours exceeds the ${MAX_PERIOD_HOURS}-hour sanity limit`);
    } else if (emp.hours > WARN_PERIOD_HOURS) {
      warnings.push(`${label}: ${emp.hours} hours is unusually high for one pay period`);
    }

    if (typeof emp.hourly_rate_cents !== 'number' || emp.hourly_rate_cents <= 0) {
      errors.push(`${label}: missing or invalid hourly rate`);
    } else if (emp.hourly_rate_cents < MIN_HOURLY_RATE_CENTS) {
      errors.push(`${label}: hourly rate is below the federal minimum wage`);
    }

    if (typeof emp.gross_pay_cents !== 'number' || emp.gross_pay_cents < 0) {
      errors.push(`${label}: missing or negative gross pay`);
    } else {
      computedTotal += emp.gross_pay_cents;
      if (typeof emp.hours === 'number' && typeof emp.hourly_rate_cents === 'number') {
        const expected = Math.round(emp.hours * emp.hourly_rate_cents);
        if (Math.abs(expected - emp.gross_pay_cents) > 100) {
          warnings.push(`${label}: gross pay differs from hours x rate by more than $1`);
        }
      }
    }
  });

  if (typeof data.total_gross_cents === 'number' && data.total_gross_cents !== computedTotal) {
    errors.push(
      `Batch total (${data.total_gross_cents}) does not match the sum of employee gross pay (${computedTotal})`
    );
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Providers. The Gusto/ADP normalizers are wired for the documented API shapes
// but should be re-verified against current provider docs before going live
// (ADP additionally requires mutual TLS certificates in production).
// ---------------------------------------------------------------------------

function mockPayrollData() {
  return {
    provider: 'mock',
    pay_period: { start: '2026-05-25', end: '2026-06-07' },
    employees: [
      { id: 'emp_1', name: 'Alex Rivera', hours: 80, hourly_rate_cents: 2400, gross_pay_cents: 192000 },
      { id: 'emp_2', name: 'Jordan Lee', hours: 72, hourly_rate_cents: 2100, gross_pay_cents: 151200 },
      { id: 'emp_3', name: 'Sam Okafor', hours: 80, hourly_rate_cents: 3050, gross_pay_cents: 244000 },
    ],
    total_gross_cents: 587200,
  };
}

function normalizeGusto(payload) {
  const payroll = Array.isArray(payload) ? payload[0] : payload;
  if (!payroll) throw new AppError(502, 'Gusto returned no payroll data');
  const employees = (payroll.employee_compensations || []).map((comp, index) => {
    const hours = (comp.hours || []).reduce
      ? Number(comp.hours)
      : Number(comp.hours || 0);
    return {
      id: String(comp.employee_id || index),
      name: comp.employee_name || `Employee ${index + 1}`,
      hours: Number.isFinite(hours) ? hours : 0,
      hourly_rate_cents: Math.round(Number(comp.hourly_rate || 0) * 100),
      gross_pay_cents: Math.round(Number(comp.gross_pay || 0) * 100),
    };
  });
  return {
    provider: 'gusto',
    pay_period: payroll.pay_period || null,
    employees,
    total_gross_cents: employees.reduce((sum, emp) => sum + emp.gross_pay_cents, 0),
  };
}

function normalizeAdp(payload) {
  const outputs = (payload && payload.payrollOutputs) || [];
  const employees = outputs.map((output, index) => ({
    id: String(output.associateOID || index),
    name: output.workerName || `Employee ${index + 1}`,
    hours: Number(output.totalHours || 0),
    hourly_rate_cents: Math.round(Number(output.hourlyRate || 0) * 100),
    gross_pay_cents: Math.round(Number(output.grossPay || 0) * 100),
  }));
  return {
    provider: 'adp',
    pay_period: payload && payload.payPeriod ? payload.payPeriod : null,
    employees,
    total_gross_cents: employees.reduce((sum, emp) => sum + emp.gross_pay_cents, 0),
  };
}

async function fetchGustoPayroll(credentials) {
  const response = await fetchWithRetry(
    `https://api.gusto.com/v1/companies/${encodeURIComponent(credentials.company_id)}/payrolls?processed=false`,
    {
      headers: {
        Authorization: `Bearer ${credentials.api_token || config.payroll.gusto.apiToken}`,
        Accept: 'application/json',
      },
    }
  );
  if (!response.ok) throw new AppError(502, `Gusto API responded with ${response.status}`);
  return normalizeGusto(await response.json());
}

async function fetchAdpPayroll(credentials) {
  const tokenResponse = await fetchWithRetry('https://accounts.adp.com/auth/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.client_id || config.payroll.adp.clientId,
      client_secret: credentials.client_secret || config.payroll.adp.clientSecret,
    }),
  });
  if (!tokenResponse.ok) throw new AppError(502, `ADP auth responded with ${tokenResponse.status}`);
  const { access_token: accessToken } = await tokenResponse.json();

  const response = await fetchWithRetry('https://api.adp.com/payroll/v1/payroll-output', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new AppError(502, `ADP API responded with ${response.status}`);
  return normalizeAdp(await response.json());
}

async function fetchFromProvider(connection) {
  if (!connection.encrypted_credentials) {
    if (config.payroll.useMock) return mockPayrollData();
    throw new AppError(409, 'Payroll credentials are not configured for this client');
  }
  const credentials = JSON.parse(decryptSecret(connection.encrypted_credentials));
  if (connection.payroll_service === 'gusto') return fetchGustoPayroll(credentials);
  if (connection.payroll_service === 'adp') return fetchAdpPayroll(credentials);
  throw new AppError(500, `Unsupported payroll service: ${connection.payroll_service}`);
}

// Submission stub: signs the batch summary so the integration point is ready;
// actual provider submission endpoints get wired here.
async function submitToProvider(connection, data, log) {
  const summary = {
    client_id: connection.client_id,
    service: connection.payroll_service,
    employee_count: data.employees.length,
    total_gross_cents: data.total_gross_cents,
  };
  const headers = signPayload(summary);
  log.info(
    { service: connection.payroll_service, employeeCount: summary.employee_count, signedAt: headers['X-Timestamp'] },
    'payroll batch validated and signed for submission'
  );
}

// Numbers-only view for the AI reviewer: names and identifiers never leave.
function stripPIIForReview(data) {
  return {
    pay_period: data.pay_period,
    employee_count: data.employees.length,
    total_gross_cents: data.total_gross_cents,
    employees: data.employees.map((emp, index) => ({
      employee: index + 1,
      hours: emp.hours,
      hourly_rate_cents: emp.hourly_rate_cents,
      gross_pay_cents: emp.gross_pay_cents,
    })),
  };
}

async function syncPayrollData(clientId, { log = logger } = {}) {
  const connection = await payrollModel.findConnectionByClient(clientId);
  if (!connection) throw new AppError(404, 'No payroll connection configured for this client');

  const syncLog = await payrollModel.startSyncLog(connection.id, clientId);

  try {
    const data = await fetchFromProvider(connection);

    const deterministic = deterministicValidate(data);
    let advisory = null;
    if (deterministic.errors.length === 0) {
      try {
        advisory = await claudeService.validatePayrollForm(stripPIIForReview(data), {
          clientId,
          log,
        });
      } catch (err) {
        log.warn({ err: { message: err.message } }, 'AI payroll review unavailable; deterministic checks stand alone');
      }
    }

    const errors = [
      ...deterministic.errors,
      ...(advisory && advisory.is_valid === false ? advisory.errors || [] : []),
    ];
    const warnings = [...deterministic.warnings, ...((advisory && advisory.warnings) || [])];
    const result = {
      is_valid: errors.length === 0,
      errors,
      warnings,
      employee_count: data.employees.length,
      total_gross_cents: data.total_gross_cents,
      ai_reviewed: Boolean(advisory),
    };

    if (!result.is_valid) {
      await payrollModel.finishSyncLog(syncLog.id, 'rejected', result, errors.join('; '));
      await payrollModel.updateConnectionStatus(connection.id, 'error', errors.join('; '));
      return { status: 'rejected', ...result };
    }

    await submitToProvider(connection, data, log);
    await payrollModel.finishSyncLog(syncLog.id, 'success', result, null);
    await payrollModel.updateConnectionStatus(connection.id, 'synced', null);
    return { status: 'synced', ...result };
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Payroll sync failed';
    await payrollModel.finishSyncLog(syncLog.id, 'error', null, message).catch(() => {});
    await payrollModel.updateConnectionStatus(connection.id, 'error', message).catch(() => {});
    log.error({ err: { message: err.message }, clientId }, 'payroll sync failed');
    throw err instanceof AppError ? err : new AppError(502, 'Payroll sync failed');
  }
}

async function getPayrollStatus(clientId) {
  const connection = await payrollModel.findConnectionByClient(clientId);
  if (!connection) return null;
  const lastSync = await payrollModel.latestSyncLog(clientId);
  return {
    service: connection.payroll_service,
    status: connection.api_status,
    last_sync_at: connection.last_sync_at,
    last_error: connection.last_error,
    last_result: lastSync
      ? {
          status: lastSync.status,
          started_at: lastSync.started_at,
          finished_at: lastSync.finished_at,
          validation: lastSync.validation_result,
        }
      : null,
  };
}

module.exports = { syncPayrollData, getPayrollStatus, deterministicValidate, signPayload };
