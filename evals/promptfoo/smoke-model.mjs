import { readFile } from 'node:fs/promises';
import OpenAI from 'openai';

const text = await readFile(new URL('../../.env', import.meta.url), 'utf8');
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (!match) continue;
  const key = match[1].trim();
  const value = match[2].trim();
  // Prefer an already-set process env (CLI override) over .env for smoke tests.
  if (process.env[key] === undefined) process.env[key] = value;
}

const model = process.env.WEBLENS_MODEL;
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
  defaultHeaders: { 'User-Agent': 'Mozilla/5.0' },
});

console.log(JSON.stringify({ model, baseURL: process.env.OPENAI_BASE_URL }, null, 2));

try {
  const response = await client.responses.create({
    model,
    max_output_tokens: 200,
    store: false,
    instructions: 'Return JSON only.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'Reply with {"ok":true,"n":1}' }] }],
    text: {
      format: {
        type: 'json_schema',
        name: 'smoke',
        strict: true,
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' }, n: { type: 'number' } },
          required: ['ok', 'n'],
          additionalProperties: false,
        },
      },
    },
  });
  console.log('responses', JSON.stringify({
    status: response.status,
    output_text: response.output_text,
    output: response.output,
    usage: response.usage,
    error: response.error,
  }, null, 2).slice(0, 4000));
} catch (error) {
  console.error('responses failed', error.status, error.message, error.error ? JSON.stringify(error.error).slice(0, 1500) : '');
}

try {
  const chat = await client.chat.completions.create({
    model,
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Reply with exactly: {"ok":true}' }],
    response_format: { type: 'json_object' },
  });
  console.log('chat', JSON.stringify(chat.choices?.[0]?.message ?? chat, null, 2).slice(0, 1500));
} catch (error) {
  console.error('chat failed', error.status, error.message, error.error ? JSON.stringify(error.error).slice(0, 1500) : '');
}
