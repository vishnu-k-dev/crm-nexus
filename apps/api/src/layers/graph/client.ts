import { Agent, fetch as undiciFetch } from 'undici';

// Lazy env reads — module evaluates before dotenv has loaded the .env file in
// dev (server.ts loads env in its module body, after imports resolve).
const HOST = (): string => process.env.TG_HOST ?? '';
const GRAPH = (): string => process.env.TG_GRAPH ?? 'TechProbe';
const TOKEN = (): string => process.env.TG_TOKEN ?? '';

function authHeaders(): Record<string, string> {
  const t = TOKEN();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Persistent connection pool for TigerGraph REST++ — reuses the TCP connection
// across queries, eliminating the per-request handshake overhead (~50-100ms).
// DNS order is already forced to ipv4first in server.ts so undici is safe on Windows.
const tgAgent = new Agent({
  connect: { keepAlive: true, keepAliveTimeout: 30_000, keepAliveMaxTimeout: 60_000 },
  connections: 10,
});

async function tgFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  return undiciFetch(url as string, { ...init, dispatcher: tgAgent } as Parameters<typeof undiciFetch>[1]) as unknown as Response;
}

export async function runQuery<T = unknown>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  // Array values (SET<STRING> GSQL params) must be sent as repeated query-string keys.
  // e.g. techNames=React&techNames=Redis
  const u = new URL(`${HOST()}/query/${GRAPH()}/${name}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) u.searchParams.append(k, String(item));
    } else {
      u.searchParams.set(k, String(v));
    }
  }
  const res = await tgFetch(u, { method: 'GET', headers: authHeaders() });
  const body = (await res.json()) as { error?: boolean; message?: string; results?: T };
  if (body.error) throw new Error(`TG query ${name} failed: ${body.message}`);
  return body.results as T;
}

interface UpsertVertexInput {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
}
interface UpsertEdgeInput {
  fromType: string; fromId: string;
  edgeType: string;
  toType: string;   toId: string;
  attributes?: Record<string, unknown>;
}

export async function upsert(vertices: UpsertVertexInput[], edges: UpsertEdgeInput[] = []): Promise<void> {
  const v: Record<string, Record<string, Record<string, { value: unknown }>>> = {};
  for (const x of vertices) {
    v[x.type] ??= {};
    const attrs: Record<string, { value: unknown }> = {};
    for (const [k, val] of Object.entries(x.attributes ?? {})) attrs[k] = { value: val };
    v[x.type][x.id] = attrs;
  }
  const e: Record<string, Record<string, Record<string, Record<string, Record<string, Record<string, { value: unknown }>>>>>> = {};
  for (const x of edges) {
    const attrs: Record<string, { value: unknown }> = {};
    for (const [k, val] of Object.entries(x.attributes ?? {})) attrs[k] = { value: val };
    e[x.fromType] ??= {};
    e[x.fromType][x.fromId] ??= {};
    e[x.fromType][x.fromId][x.edgeType] ??= {};
    e[x.fromType][x.fromId][x.edgeType][x.toType] ??= {};
    e[x.fromType][x.fromId][x.edgeType][x.toType][x.toId] = attrs;
  }
  const payload = { vertices: v, edges: e };
  const res = await tgFetch(`${HOST()}/graph/${GRAPH()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { error?: boolean; message?: string };
  if (body.error) {
    // eslint-disable-next-line no-console
    console.error('[upsert] TG rejected:', body.message, 'payload sample:', JSON.stringify(payload).slice(0, 400));
    throw new Error(`TG upsert failed: ${body.message}`);
  }
}

export async function ping(): Promise<boolean> {
  const h = HOST();
  if (!h) return false;
  try {
    const res = await tgFetch(`${h}/echo`, { method: 'GET', headers: authHeaders() });
    return res.ok;
  } catch { return false; }
}
