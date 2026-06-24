const express = require('express');
const { AppError, asyncHandler } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { validate, z, uuid, pagination } = require('../middleware/validate');
const { recordAudit } = require('../middleware/audit');
const clientsModel = require('../models/clients.model');
const subscriptionsModel = require('../models/subscriptions.model');
const callsModel = require('../models/calls.model');
const websitesModel = require('../models/websites.model');
const ticketsModel = require('../models/tickets.model');
const auditModel = require('../models/audit.model');
const leadsModel = require('../models/leads.model');
const payrollModel = require('../models/payroll.model');
const payrollService = require('../services/payroll.service');
const stripeService = require('../services/stripe.service');
const claudeService = require('../services/claude.service');

const router = express.Router();

router.use(requireAuth);

const idParams = z.object({ id: uuid });

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get(
  '/dashboard/stats',
  asyncHandler(async (req, res) => {
    const stats = await clientsModel.dashboardStats();
    await recordAudit(req, 'viewed_dashboard');
    res.json({ data: stats });
  })
);

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

router.get(
  '/clients',
  validate({ query: pagination.extend({ search: z.string().trim().max(255).optional() }) }),
  asyncHandler(async (req, res) => {
    const { page, limit, search } = req.validatedQuery;
    const { clients, total } = await clientsModel.list({
      search: search || null,
      limit,
      offset: (page - 1) * limit,
    });
    await recordAudit(req, 'viewed_clients_list', 'client', null, { page, search: search || null });
    res.json({ data: clients, pagination: { page, limit, total } });
  })
);

router.get(
  '/clients/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const client = await clientsModel.findById(req.params.id);
    if (!client) throw new AppError(404, 'Client not found');

    const [subscription, payments, website, calls, payroll, tickets] = await Promise.all([
      subscriptionsModel.findByClient(client.id),
      subscriptionsModel.listPaymentsByClient(client.id, 10),
      websitesModel.findByClient(client.id),
      callsModel.list({ clientId: client.id, limit: 10, offset: 0 }),
      payrollService.getPayrollStatus(client.id),
      ticketsModel.listByClient(client.id),
    ]);

    await recordAudit(req, 'viewed_client', 'client', client.id);
    res.json({
      data: {
        client,
        subscription,
        payments,
        website,
        recent_calls: calls.calls,
        payroll,
        tickets,
      },
    });
  })
);

const clientCreateSchema = z.object({
  business_name: z.string().trim().min(2).max(255),
  email: z.string().email().max(255),
  phone: z.string().trim().max(20).optional(),
});

// Onboard a new client. Stripe customer creation is deferred to the first
// checkout link, so onboarding works even before Stripe is configured.
router.post(
  '/clients',
  validate({ body: clientCreateSchema }),
  asyncHandler(async (req, res) => {
    const existing = await clientsModel.findByEmail(req.body.email);
    if (existing) throw new AppError(409, 'A client with that email already exists');
    const client = await clientsModel.create({
      businessName: req.body.business_name,
      email: req.body.email,
      phone: req.body.phone || null,
    });
    await recordAudit(req, 'created_client', 'client', client.id, { email: client.email });
    res.status(201).json({ data: client });
  })
);

const checkoutSchema = z.object({ tier: z.enum(['starter', 'pro', 'enterprise']) });

// Generate a hosted Stripe Checkout link to send to the client.
router.post(
  '/clients/:id/checkout',
  validate({ params: idParams, body: checkoutSchema }),
  asyncHandler(async (req, res) => {
    const client = await clientsModel.findById(req.params.id);
    if (!client) throw new AppError(404, 'Client not found');
    const url = await stripeService.createCheckoutSession(client, req.body.tier);
    await recordAudit(req, 'created_checkout_link', 'client', client.id, { tier: req.body.tier });
    res.json({ data: { url } });
  })
);

// Open the Stripe billing portal for an existing subscriber.
router.post(
  '/clients/:id/billing-portal',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const client = await clientsModel.findById(req.params.id);
    if (!client) throw new AppError(404, 'Client not found');
    const url = await stripeService.createBillingPortalSession(client);
    await recordAudit(req, 'opened_billing_portal', 'client', client.id);
    res.json({ data: { url } });
  })
);

// ---------------------------------------------------------------------------
// Leads (from the public landing page)
// ---------------------------------------------------------------------------

router.get(
  '/leads',
  validate({
    query: pagination.extend({
      status: z.enum(['new', 'contacted', 'converted', 'dismissed']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit, status } = req.validatedQuery;
    const { leads, total } = await leadsModel.list({
      status: status || null,
      limit,
      offset: (page - 1) * limit,
    });
    await recordAudit(req, 'viewed_leads');
    res.json({ data: leads, pagination: { page, limit, total } });
  })
);

// Convert a lead into a client (then the client can be sent a checkout link).
router.post(
  '/leads/:id/convert',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const lead = await leadsModel.findById(req.params.id);
    if (!lead) throw new AppError(404, 'Lead not found');
    if (lead.converted_client_id) throw new AppError(409, 'Lead is already converted');

    const existing = await clientsModel.findByEmail(lead.email);
    if (existing) throw new AppError(409, 'A client with that email already exists');

    const client = await clientsModel.create({
      businessName: lead.business_name,
      email: lead.email,
      phone: lead.phone || null,
    });
    const updatedLead = await leadsModel.setStatus(lead.id, 'converted', client.id);
    await recordAudit(req, 'converted_lead', 'lead', lead.id, { client_id: client.id });
    res.status(201).json({ data: { client, lead: updatedLead } });
  })
);

router.post(
  '/leads/:id/dismiss',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const lead = await leadsModel.setStatus(req.params.id, 'dismissed');
    if (!lead) throw new AppError(404, 'Lead not found');
    await recordAudit(req, 'dismissed_lead', 'lead', req.params.id);
    res.json({ data: lead });
  })
);

// ---------------------------------------------------------------------------
// Websites
// ---------------------------------------------------------------------------

router.get(
  '/clients/:id/website',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const website = await websitesModel.findByClient(req.params.id);
    if (!website) throw new AppError(404, 'No website for this client');
    await recordAudit(req, 'viewed_website', 'website', website.id);
    res.json({ data: website });
  })
);

const websiteUpdateSchema = z
  .object({
    domain: z
      .string()
      .trim()
      .min(3)
      .max(255)
      .regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i, 'Must be a valid domain name')
      .optional(),
    template_id: z.string().trim().min(1).max(100).optional(),
    content: z.record(z.any()).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No fields to update' });

router.put(
  '/clients/:id/website',
  validate({ params: idParams, body: websiteUpdateSchema }),
  asyncHandler(async (req, res) => {
    const website = await websitesModel.update(req.params.id, req.body);
    if (!website) throw new AppError(404, 'No website for this client');
    await recordAudit(req, 'updated_website', 'website', website.id, {
      fields: Object.keys(req.body),
    });
    res.json({ data: website });
  })
);

router.post(
  '/clients/:id/website/publish',
  validate({ params: idParams, body: z.object({ published: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const existing = await websitesModel.findByClient(req.params.id);
    if (!existing) throw new AppError(404, 'No website for this client');
    if (req.body.published && !existing.domain) {
      throw new AppError(409, 'Add a domain before publishing');
    }
    const website = await websitesModel.setPublished(req.params.id, {
      published: req.body.published,
      publishedUrl: req.body.published ? `https://${existing.domain}` : existing.published_url,
    });
    await recordAudit(req, req.body.published ? 'published_website' : 'unpublished_website', 'website', website.id);
    res.json({ data: website });
  })
);

router.post(
  '/clients/:id/website/generate',
  validate({
    params: idParams,
    body: z.object({
      business_type: z.string().trim().min(2).max(200),
      prompt: z.string().trim().min(2).max(5000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const client = await clientsModel.findById(req.params.id);
    if (!client) throw new AppError(404, 'Client not found');
    const draft = await claudeService.generateWebsiteContent(req.body.business_type, req.body.prompt, {
      clientId: client.id,
      log: req.log,
    });
    const website = await websitesModel.saveGeneratedDraft(client.id, draft);
    await recordAudit(req, 'generated_website_content', 'website', website.id);
    res.json({ data: { draft, website } });
  })
);

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

const callFilters = pagination.extend({
  client_id: uuid.optional(),
  outcome: z.enum(['completed', 'missed', 'voicemail', 'failed', 'busy', 'in_progress']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.get(
  '/calls',
  validate({ query: callFilters }),
  asyncHandler(async (req, res) => {
    const { page, limit, client_id: clientId, outcome, from, to } = req.validatedQuery;
    const { calls, total } = await callsModel.list({
      clientId: clientId || null,
      outcome: outcome || null,
      from: from || null,
      to: to || null,
      limit,
      offset: (page - 1) * limit,
    });
    await recordAudit(req, 'viewed_calls_list', 'call', null, { page, clientId: clientId || null });
    res.json({ data: calls, pagination: { page, limit, total } });
  })
);

router.get(
  '/calls/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const call = await callsModel.findById(req.params.id);
    if (!call) throw new AppError(404, 'Call not found');
    await recordAudit(req, 'viewed_call_transcript', 'call', call.id);
    res.json({ data: call });
  })
);

router.get(
  '/clients/:id/calls',
  validate({ params: idParams, query: pagination }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.validatedQuery;
    const { calls, total } = await callsModel.list({
      clientId: req.params.id,
      limit,
      offset: (page - 1) * limit,
    });
    await recordAudit(req, 'viewed_client_calls', 'client', req.params.id, { page });
    res.json({ data: calls, pagination: { page, limit, total } });
  })
);

router.get(
  '/clients/:id/calls/:callId/transcript',
  validate({ params: z.object({ id: uuid, callId: uuid }) }),
  asyncHandler(async (req, res) => {
    const call = await callsModel.findByClientAndId(req.params.id, req.params.callId);
    if (!call) throw new AppError(404, 'Call not found');
    await recordAudit(req, 'viewed_call_transcript', 'call', call.id);
    res.json({ data: call });
  })
);

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

router.get(
  '/payroll/status',
  asyncHandler(async (req, res) => {
    const connections = await payrollModel.listConnections();
    await recordAudit(req, 'viewed_payroll_overview');
    res.json({ data: connections });
  })
);

router.get(
  '/clients/:id/payroll-status',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const status = await payrollService.getPayrollStatus(req.params.id);
    if (!status) throw new AppError(404, 'No payroll connection configured for this client');
    await recordAudit(req, 'viewed_payroll_status', 'client', req.params.id);
    res.json({ data: status });
  })
);

router.post(
  '/clients/:id/payroll/sync',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const result = await payrollService.syncPayrollData(req.params.id, { log: req.log });
    await recordAudit(req, 'triggered_payroll_sync', 'client', req.params.id, {
      status: result.status,
    });
    res.json({ data: result });
  })
);

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

router.get(
  '/support-tickets',
  validate({
    query: pagination.extend({
      status: z.enum(['open', 'in_progress', 'resolved']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit, status } = req.validatedQuery;
    const { tickets, total } = await ticketsModel.listAll({
      status: status || null,
      limit,
      offset: (page - 1) * limit,
    });
    await recordAudit(req, 'viewed_support_queue');
    res.json({ data: tickets, pagination: { page, limit, total } });
  })
);

router.get(
  '/clients/:id/support-tickets',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const tickets = await ticketsModel.listByClient(req.params.id);
    await recordAudit(req, 'viewed_client_tickets', 'client', req.params.id);
    res.json({ data: tickets });
  })
);

router.post(
  '/clients/:id/support-tickets/:ticketId/resolve',
  validate({ params: z.object({ id: uuid, ticketId: uuid }) }),
  asyncHandler(async (req, res) => {
    const ticket = await ticketsModel.resolve(req.params.id, req.params.ticketId, req.admin.id);
    if (!ticket) throw new AppError(404, 'Ticket not found');
    await recordAudit(req, 'resolved_ticket', 'support_ticket', ticket.id);
    res.json({ data: ticket });
  })
);

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

router.get(
  '/audit-logs',
  validate({
    query: pagination.extend({
      action: z.string().trim().max(255).optional(),
      resource_type: z.string().trim().max(50).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { page, limit, action, resource_type: resourceType } = req.validatedQuery;
    const { logs, total } = await auditModel.list({
      action: action || null,
      resourceType: resourceType || null,
      limit,
      offset: (page - 1) * limit,
    });
    await recordAudit(req, 'viewed_audit_logs');
    res.json({ data: logs, pagination: { page, limit, total } });
  })
);

module.exports = router;
