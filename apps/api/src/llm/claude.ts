import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GEN = process.env.GEN_MODEL ?? 'claude-haiku-4-5-20251001';
const JUDGE = process.env.JUDGE_MODEL ?? 'claude-sonnet-4-6';

export interface LLMResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

const HAIKU_PRICE = { in: 0.8 / 1e6, out: 4 / 1e6 };
const SONNET_PRICE = { in: 3 / 1e6, out: 15 / 1e6 };

export function costUsd(model: string, p: number, c: number): number {
  const r = model.includes('sonnet') ? SONNET_PRICE : HAIKU_PRICE;
  return p * r.in + c * r.out;
}

export async function generate(opts: { system: string; user: string; cacheSystem?: boolean; maxTokens?: number }): Promise<LLMResult> {
  const t0 = Date.now();
  const sys = opts.cacheSystem
    ? [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }]
    : opts.system;
  const msg = await client.messages.create({
    model: GEN,
    max_tokens: opts.maxTokens ?? 400,
    system: sys as never,
    messages: [{ role: 'user', content: opts.user }],
  });
  const text = msg.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return {
    text,
    model: GEN,
    promptTokens: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0),
    completionTokens: msg.usage.output_tokens,
    latencyMs: Date.now() - t0,
  };
}

export async function judge(opts: { system: string; user: string; maxTokens?: number }): Promise<LLMResult> {
  const t0 = Date.now();
  const msg = await client.messages.create({
    model: JUDGE,
    max_tokens: opts.maxTokens ?? 600,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  const text = msg.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return {
    text,
    model: JUDGE,
    promptTokens: msg.usage.input_tokens,
    completionTokens: msg.usage.output_tokens,
    latencyMs: Date.now() - t0,
  };
}
