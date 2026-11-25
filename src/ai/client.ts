// Streaming completion for the supported providers.
//  - Anthropic (Claude): official @anthropic-ai/sdk, called directly from the browser.
//  - OpenAI / OpenAI-compatible (OpenRouter, local Ollama, LM Studio…): Chat Completions over fetch.
import Anthropic from '@anthropic-ai/sdk';
import { useSettings, type AIProvider } from '@/store/settings';
import { getApiKey } from './keys';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  /** Stable instructions (cached). */
  system: string;
  /** Large novel context (cached separately so follow-up questions are cheap). */
  context?: string;
  messages: ChatTurn[];
  onText?: (delta: string, full: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
}

export class AIError extends Error {
  constructor(
    public code: 'no-key' | 'auth' | 'rate' | 'network' | 'refusal' | 'bad-request' | 'server' | 'aborted',
    message: string,
  ) {
    super(message);
  }
}

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: { ar: 'الافتراضي — أفضل توازن للتحليل الأدبي', en: 'Default — best balance for literary analysis' } },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: { ar: 'أسرع وأقل تكلفة', en: 'Faster, lower cost' } },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: { ar: 'الأسرع والأرخص للمهام الخفيفة', en: 'Fastest and cheapest for light tasks' } },
  { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', note: { ar: 'الأقوى — أعلى تكلفة', en: 'Most capable — highest cost' } },
];

// Models that support the server-side refusal fallback.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5']);

export function providerLabel(p: AIProvider) {
  return p === 'anthropic' ? 'Anthropic (Claude)' : p === 'openai' ? 'OpenAI' : 'OpenAI-compatible';
}

export async function complete(req: CompletionRequest): Promise<string> {
  const { ai, privacy } = useSettings.getState();
  if (!privacy.aiEnabled) throw new AIError('bad-request', 'AI is disabled in privacy settings');
  const key = getApiKey(ai.provider);
  if (!key && ai.provider !== 'compatible') throw new AIError('no-key', 'No API key');
  if (ai.provider === 'anthropic') return completeAnthropic(req, key!, ai.model, ai.effort);
  return completeOpenAI(req, key, ai.provider === 'openai' ? 'https://api.openai.com/v1' : ai.baseUrl, ai.model, ai.temperature);
}

async function completeAnthropic(req: CompletionRequest, apiKey: string, model: string, effort: 'low' | 'medium' | 'high'): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: req.system }];
  if (req.context) system.push({ type: 'text', text: req.context, cache_control: { type: 'ephemeral' } });
  const useFallback = FALLBACK_MODELS.has(model);
  let full = '';
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: req.maxTokens ?? 16000,
        system,
        messages: req.messages,
        output_config: { effort },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: req.signal },
    );
    stream.on('text', (delta) => {
      full += delta;
      req.onText?.(delta, full);
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new AIError('refusal', final.stop_details?.explanation ?? 'Declined');
    return full;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.APIUserAbortError || req.signal?.aborted) throw new AIError('aborted', 'Stopped');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AIError('auth', e.message);
    if (e instanceof Anthropic.RateLimitError) throw new AIError('rate', e.message);
    if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) throw new AIError('bad-request', e.message);
    if (e instanceof Anthropic.APIConnectionError) throw new AIError('network', e.message);
    if (e instanceof Anthropic.APIError) throw new AIError('server', e.message);
    throw new AIError('network', String(e));
  }
}

async function completeOpenAI(req: CompletionRequest, apiKey: string | undefined, baseUrl: string, model: string, temperature: number): Promise<string> {
  if (!baseUrl) throw new AIError('bad-request', 'Missing base URL');
  const messages = [{ role: 'system', content: req.context ? `${req.system}\n\n${req.context}` : req.system }, ...req.messages];
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages, stream: true, temperature, max_tokens: req.maxTokens ?? 8000 }),
      signal: req.signal,
    });
  } catch (e) {
    if (req.signal?.aborted) throw new AIError('aborted', 'Stopped');
    throw new AIError('network', String(e));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AIError(res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate' : res.status >= 500 ? 'server' : 'bad-request', `${res.status} ${text.slice(0, 300)}`);
  }
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const data = l.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
          if (delta) {
            full += delta;
            req.onText?.(delta, full);
          }
        } catch {
          /* partial line */
        }
      }
    }
  } catch (e) {
    if (req.signal?.aborted) throw new AIError('aborted', 'Stopped');
    throw new AIError('network', String(e));
  }
  return full;
}

/** Minimal request to validate a key. */
export async function testConnection(): Promise<string> {
  return complete({ system: 'Reply with the single word: OK', messages: [{ role: 'user', content: 'ping' }], maxTokens: 64 });
}
