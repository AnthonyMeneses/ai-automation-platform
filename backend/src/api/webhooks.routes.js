const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { logger } = require('../utils/logger');
const stripeService = require('../services/stripe.service');
const twilioService = require('../services/twilio.service');
const callsModel = require('../models/calls.model');
const clientsModel = require('../models/clients.model');

const router = express.Router();

// Stripe: signature is verified against the raw body. A 500 here makes Stripe
// retry the delivery, which is what we want for transient failures.
router.post(
  '/stripe',
  asyncHandler(async (req, res) => {
    const log = req.log || logger;
    let event;
    try {
      event = stripeService.constructEvent(req.body, req.headers['stripe-signature']);
    } catch (err) {
      log.warn({ message: err.message }, 'stripe webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    await stripeService.handleEvent(event, log);
    return res.json({ received: true });
  })
);

// Twilio: incoming call -> create the call row, answer with TwiML.
router.post(
  '/twilio/voice',
  twilioService.verifySignature,
  asyncHandler(async (req, res) => {
    const { CallSid, From, To, Direction } = req.body;
    const client = To ? await clientsModel.findByTwilioNumber(To) : null;
    await callsModel.create({
      clientId: client ? client.id : null,
      twilioCallSid: CallSid,
      direction: Direction && Direction.startsWith('outbound') ? 'outbound' : 'inbound',
      callerPhone: From || null,
      toPhone: To || null,
      outcome: 'in_progress',
    });
    res.type('text/xml').send(twilioService.voiceResponse(client ? client.business_name : null));
  })
);

// Twilio: call status callback -> final duration and outcome.
router.post(
  '/twilio/status',
  twilioService.verifySignature,
  asyncHandler(async (req, res) => {
    const { CallSid, CallStatus, CallDuration } = req.body;
    if (CallSid) {
      await callsModel.updateBySid(CallSid, {
        duration_seconds: CallDuration ? Number(CallDuration) : undefined,
        call_outcome: twilioService.mapOutcome(CallStatus),
      });
    }
    res.sendStatus(204);
  })
);

// Twilio: transcription callback -> store transcript, then run AI analysis
// after the response is sent so Twilio isn't kept waiting on the model.
router.post(
  '/twilio/transcription',
  twilioService.verifySignature,
  asyncHandler(async (req, res) => {
    const log = req.log || logger;
    const { CallSid, TranscriptionText, RecordingUrl } = req.body;
    if (CallSid && TranscriptionText) {
      await callsModel.updateBySid(CallSid, {
        transcript: TranscriptionText,
        recording_url: RecordingUrl || undefined,
        call_outcome: 'voicemail',
      });
      res.sendStatus(204);
      twilioService
        .analyzeTranscript(CallSid, TranscriptionText, log)
        .catch((err) => log.error({ err: { message: err.message }, CallSid }, 'transcript analysis failed'));
      return;
    }
    res.sendStatus(204);
  })
);

module.exports = router;
