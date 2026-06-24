const twilio = require('twilio');
const config = require('../config');
const { AppError } = require('../utils/errors');
const callsModel = require('../models/calls.model');
const claudeService = require('./claude.service');

// Twilio signs webhooks against the exact public URL it called, so this only
// validates correctly when PUBLIC_BASE_URL matches the URL configured in the
// Twilio console. In development, unsigned requests (e.g. local curl) pass.
function verifySignature(req, res, next) {
  const signature = req.get('x-twilio-signature');
  if (!signature) {
    if (config.env !== 'production') return next();
    return next(new AppError(403, 'Missing webhook signature'));
  }
  const url = `${config.publicBaseUrl}${req.originalUrl}`;
  const valid = twilio.validateRequest(config.twilio.authToken, signature, url, req.body || {});
  if (!valid) return next(new AppError(403, 'Invalid webhook signature'));
  return next();
}

const OUTCOME_BY_STATUS = {
  completed: 'completed',
  busy: 'busy',
  failed: 'failed',
  'no-answer': 'missed',
  canceled: 'missed',
};

function mapOutcome(callStatus) {
  return OUTCOME_BY_STATUS[callStatus] || 'completed';
}

// Voicemail + transcription flow. Real-time conversational AI would move to
// Twilio Media Streams / ConversationRelay; this records and transcribes, then
// Claude extracts intent from the transcript callback.
function voiceResponse(businessName) {
  const response = new twilio.twiml.VoiceResponse();
  const name = businessName || 'this business';
  response.say(
    { voice: 'Polly.Joanna' },
    `Thank you for calling ${name}. Please leave a message after the tone, and our team will follow up shortly.`
  );
  response.record({
    maxLength: 180,
    playBeep: true,
    transcribe: true,
    transcribeCallback: '/api/webhooks/twilio/transcription',
  });
  response.hangup();
  return response.toString();
}

async function analyzeTranscript(callSid, transcript, log) {
  const call = await callsModel.findBySid(callSid);
  if (!call) return;
  const analysis = await claudeService.analyzeCallTranscript(transcript, {
    clientId: call.client_id,
    log,
  });
  await callsModel.updateBySid(callSid, {
    ai_intent: analysis.intent,
    ai_sentiment: analysis.sentiment,
    ai_summary: analysis.summary,
    ai_action_items: analysis.action_items,
  });
  log.info({ callSid, intent: analysis.intent }, 'call transcript analyzed');
}

module.exports = { verifySignature, mapOutcome, voiceResponse, analyzeTranscript };
