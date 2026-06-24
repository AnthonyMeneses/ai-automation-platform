const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }))
);
jest.mock('../src/services/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const config = require('../src/config');
const claude = require('../src/services/claude.service');

function structuredResponse(payload, model = 'claude-fable-5') {
  return {
    model,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: 120, output_tokens: 60 },
  };
}

describe('analyzeCallTranscript', () => {
  test('returns the structured analysis from the model', async () => {
    mockCreate.mockResolvedValue(
      structuredResponse({
        intent: 'scheduling',
        sentiment: 'positive',
        urgency: 'medium',
        summary: 'Caller wants to book an appointment.',
        action_items: ['Call back to confirm a slot'],
      })
    );

    const result = await claude.analyzeCallTranscript('Hi, I would like to book an appointment.');
    expect(result.intent).toBe('scheduling');
    expect(result.action_items).toHaveLength(1);

    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe(config.anthropic.complexModel);
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.messages[0].content).toContain('<transcript>');
  });

  test('strips control characters and truncates oversized transcripts', async () => {
    mockCreate.mockResolvedValue(
      structuredResponse({
        intent: 'other',
        sentiment: 'neutral',
        urgency: 'low',
        summary: 's',
        action_items: [],
      })
    );

    const dirty = `hello${String.fromCharCode(0)}${String.fromCharCode(27)} world ${'x'.repeat(60000)}`;
    await claude.analyzeCallTranscript(dirty);

    const sent = mockCreate.mock.calls[0][0].messages[0].content;
    expect(sent).toContain('hello world');
    expect(sent).not.toContain(String.fromCharCode(0));
    expect(sent.length).toBeLessThan(51000);
  });

  test('rejects an empty transcript without calling the API', async () => {
    await expect(claude.analyzeCallTranscript('   ')).rejects.toThrow('Transcript is empty');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('falls back to the default model when the complex model is disabled', async () => {
    const original = config.anthropic.enableComplexModel;
    config.anthropic.enableComplexModel = false;
    try {
      mockCreate.mockResolvedValue(
        structuredResponse(
          { intent: 'other', sentiment: 'neutral', urgency: 'low', summary: 's', action_items: [] },
          'claude-sonnet-4-6'
        )
      );
      await claude.analyzeCallTranscript('quick question about hours');
      expect(mockCreate.mock.calls[0][0].model).toBe(config.anthropic.defaultModel);
    } finally {
      config.anthropic.enableComplexModel = original;
    }
  });

  test('maps provider failures to a sanitized 502', async () => {
    const upstream = new Error('upstream exploded with secret details');
    upstream.status = 529;
    mockCreate.mockRejectedValue(upstream);

    await expect(claude.analyzeCallTranscript('hello there')).rejects.toMatchObject({
      statusCode: 502,
      message: 'AI service is temporarily unavailable',
    });
  });
});

describe('validatePayrollForm', () => {
  test('redacts PII before it reaches the model', async () => {
    mockCreate.mockResolvedValue(
      structuredResponse({ is_valid: true, errors: [], warnings: [] })
    );

    await claude.validatePayrollForm({ note: 'ssn 123-45-6789', employees: [] });

    const sent = mockCreate.mock.calls[0][0].messages[0].content;
    expect(sent).not.toContain('123-45-6789');
    expect(sent).toContain('[REDACTED-SSN]');
  });
});

describe('generateWebsiteContent', () => {
  test('uses the cost-effective default model', async () => {
    mockCreate.mockResolvedValue(
      structuredResponse(
        { headline: 'h', meta_description: 'm', html: '<html></html>' },
        'claude-sonnet-4-6'
      )
    );

    const result = await claude.generateWebsiteContent('florist', 'A cozy flower shop in Austin');
    expect(result.html).toContain('<html>');
    expect(mockCreate.mock.calls[0][0].model).toBe(config.anthropic.defaultModel);
  });
});
