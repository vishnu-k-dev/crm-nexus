import type { Archetype } from './domainClassifier.js';

export interface DepthMarker { id: string; text: string; signal_type: 'real' | 'faker' }
export interface SeedQuestion { id: string; text: string; difficulty: 1 | 2 | 3 | 4 | 5; archetype: Archetype; markers: string[] }

// Interaction: a named cross-technology pattern that two or more techs participate in.
// When a repo's USES edges land on ≥2 techs that share an Interaction vertex,
// the interaction's markers are injected into the probe set. This enables questions that
// *cannot* be answered by reading docs — only by someone who dealt with the actual
// integration failure modes (e.g., Redis pub/sub split-brain with Socket.IO fanout).
export interface Interaction { id: string; name: string; description: string; techs: string[]; markers: string[] }

// DepthMarkers: phrases / topics that distinguish a real builder from a vibe-coder.
// Question seeds: 5–8 per archetype, increasing difficulty. The graph maps each Q
// to one or more DepthMarkers via EXEMPLIFIES; the GraphRAG retriever scores Qs
// by how many markers from the candidate's domains they cover.

export const DEPTH_MARKERS: DepthMarker[] = [
  // distributed_system
  { id: 'dm-dist-01', text: 'idempotency keys for retried writes', signal_type: 'real' },
  { id: 'dm-dist-02', text: 'consensus and leader election trade-offs', signal_type: 'real' },
  { id: 'dm-dist-03', text: 'backpressure and queue depth thresholds', signal_type: 'real' },
  { id: 'dm-dist-04', text: 'exactly-once vs at-least-once delivery semantics', signal_type: 'real' },
  { id: 'dm-dist-05', text: 'partition tolerance under network split', signal_type: 'real' },
  // ml_system
  { id: 'dm-ml-01', text: 'eval set construction and contamination checks', signal_type: 'real' },
  { id: 'dm-ml-02', text: 'embedding model swap and re-indexing strategy', signal_type: 'real' },
  { id: 'dm-ml-03', text: 'prompt cache hit-rate and TTL tuning', signal_type: 'real' },
  { id: 'dm-ml-04', text: 'hallucination grounding via citation', signal_type: 'real' },
  { id: 'dm-ml-05', text: 'token-budget vs answer-quality trade-off', signal_type: 'real' },
  // frontend_system
  { id: 'dm-fe-01', text: 'hydration mismatch and SSR boundaries', signal_type: 'real' },
  { id: 'dm-fe-02', text: 'render-pass cost and memoization boundaries', signal_type: 'real' },
  { id: 'dm-fe-03', text: 'route-level code splitting and prefetch', signal_type: 'real' },
  { id: 'dm-fe-04', text: 'accessibility focus traps and aria-live', signal_type: 'real' },
  { id: 'dm-fe-05', text: 'state colocation vs lifted store', signal_type: 'real' },
  // backend_api_system
  { id: 'dm-be-01', text: 'connection pool exhaustion under burst', signal_type: 'real' },
  { id: 'dm-be-02', text: 'N+1 query detection and dataloader patterns', signal_type: 'real' },
  { id: 'dm-be-03', text: 'optimistic concurrency and write conflicts', signal_type: 'real' },
  { id: 'dm-be-04', text: 'auth token rotation and revocation', signal_type: 'real' },
  { id: 'dm-be-05', text: 'request coalescing and idempotent endpoints', signal_type: 'real' },
  // data_pipeline_system
  { id: 'dm-dp-01', text: 'late-arriving events and watermarks', signal_type: 'real' },
  { id: 'dm-dp-02', text: 'schema evolution and backfill strategy', signal_type: 'real' },
  { id: 'dm-dp-03', text: 'dedup keys and tombstone handling', signal_type: 'real' },
  { id: 'dm-dp-04', text: 'partition strategy and skew', signal_type: 'real' },
  // real_time_system
  { id: 'dm-rt-01', text: 'sticky sessions vs stateless fanout', signal_type: 'real' },
  { id: 'dm-rt-02', text: 'reconnect with resume token', signal_type: 'real' },
  { id: 'dm-rt-03', text: 'presence and heartbeat intervals', signal_type: 'real' },
  // blockchain_system
  { id: 'dm-bc-01', text: 'reentrancy guards and checks-effects-interactions', signal_type: 'real' },
  { id: 'dm-bc-02', text: 'gas-cost accounting per call path', signal_type: 'real' },
  { id: 'dm-bc-03', text: 'oracle freshness and manipulation surface', signal_type: 'real' },
  // infra_devops_system
  { id: 'dm-do-01', text: 'pod disruption budgets and rolling restarts', signal_type: 'real' },
  { id: 'dm-do-02', text: 'blue-green vs canary tradeoffs at this scale', signal_type: 'real' },
  { id: 'dm-do-03', text: 'secret rotation and sealed-secrets workflow', signal_type: 'real' },
];

// ─── Cross-Technology Interaction Layer ─────────────────────────────────────
// Each entry names the two (or more) Tech vertex IDs that must both appear
// in a repo's USES edges for this interaction to activate.
// The `markers` field lists DepthMarker IDs that are REQUIRES'd by this interaction —
// these bubble up in the HeapAccum alongside domain markers, boosting cross-tech questions.
export const INTERACTIONS: Interaction[] = [
  {
    id: 'ix-react-redis', name: 'react_redis_cache',
    description: 'Client state invalidation when Redis cache is updated server-side. Real builders hit the window where the React store is fresh but Redis is stale (or vice versa).',
    techs: ['React', 'Redis'], markers: ['dm-fe-05', 'dm-rt-01'],
  },
  {
    id: 'ix-next-redis', name: 'nextjs_redis_isr',
    description: 'Next.js ISR/SSR page reads from Redis for cached data while a background job updates Postgres. Builders must manage the invalidation window.',
    techs: ['Next.js', 'Redis'], markers: ['dm-fe-01', 'dm-rt-01'],
  },
  {
    id: 'ix-socket-redis', name: 'socketio_redis_pubsub',
    description: 'Socket.IO adapter publishing events via Redis pub/sub across multiple server pods. Real builders deal with sticky sessions vs stateless fanout.',
    techs: ['Socket.IO', 'Redis'], markers: ['dm-rt-01', 'dm-rt-02'],
  },
  {
    id: 'ix-bullmq-redis', name: 'bullmq_redis_backpressure',
    description: 'BullMQ queue depth management and backpressure via Redis. Builders must set concurrency + rate limits to avoid starving the Redis connection pool.',
    techs: ['BullMQ', 'Redis'], markers: ['dm-dist-03', 'dm-dist-01'],
  },
  {
    id: 'ix-kafka-pg', name: 'kafka_postgres_outbox',
    description: 'Transactional outbox: Kafka produce and Postgres write must be atomic. Real builders know exactly-once across the two systems is non-trivial.',
    techs: ['Kafka', 'Postgres'], markers: ['dm-dist-01', 'dm-dist-04', 'dm-dp-03'],
  },
  {
    id: 'ix-prisma-pg', name: 'prisma_postgres_pool',
    description: 'Prisma connection pooler (PgBouncer or built-in) and N+1 query surface under burst. Builders must tune pool size to avoid exhaustion at cold start.',
    techs: ['Prisma', 'Postgres'], markers: ['dm-be-01', 'dm-be-02'],
  },
  {
    id: 'ix-express-pg', name: 'express_postgres_pool',
    description: 'Express.js + pg/node-postgres connection pool exhaustion under traffic spike. Builders know idle timeout vs max-connections tuning from production pain.',
    techs: ['Express', 'Postgres'], markers: ['dm-be-01', 'dm-be-02'],
  },
  {
    id: 'ix-fastify-redis', name: 'fastify_redis_cache',
    description: 'Fastify route-level response caching with Redis; cache invalidation strategy and race between in-flight request and cache eviction.',
    techs: ['Fastify', 'Redis'], markers: ['dm-be-05', 'dm-rt-01'],
  },
  {
    id: 'ix-fastapi-pg', name: 'fastapi_postgres_async',
    description: 'FastAPI async context + asyncpg/SQLAlchemy async pool under concurrent requests. Builders hit "too many clients" or connection leak on exception paths.',
    techs: ['FastAPI', 'Postgres'], markers: ['dm-be-01', 'dm-be-03'],
  },
  {
    id: 'ix-langchain-openai', name: 'langchain_openai_budget',
    description: 'LangChain chain token budgeting and OpenAI prompt cache utilization. Builders tune chain structure to maximise cache prefix hits and cut spend.',
    techs: ['LangChain', 'OpenAI'], markers: ['dm-ml-03', 'dm-ml-05'],
  },
  {
    id: 'ix-langchain-anthropic', name: 'langchain_anthropic_budget',
    description: 'LangChain chain + Anthropic prompt caching (5-min TTL). Builders must structure system prompts to maximise cache hits across chain invocations.',
    techs: ['LangChain', 'Anthropic'], markers: ['dm-ml-03', 'dm-ml-05'],
  },
  {
    id: 'ix-docker-k8s', name: 'docker_k8s_secrets',
    description: 'Secret injection and rotation from Kubernetes Secrets/sealed-secrets into Docker containers. Builders deal with stale mounts vs live-reload strategies.',
    techs: ['Docker', 'Kubernetes'], markers: ['dm-do-03', 'dm-do-01'],
  },
  {
    id: 'ix-react-supabase', name: 'react_supabase_realtime',
    description: 'React state sync with Supabase Realtime subscriptions. Builders hit the window between an optimistic local update and the server broadcast arriving.',
    techs: ['React', 'Supabase'], markers: ['dm-fe-05', 'dm-rt-02'],
  },
  {
    id: 'ix-nestjs-redis', name: 'nestjs_redis_cache',
    description: 'NestJS CacheModule / cache-manager with Redis. Builders must handle TTL mismatches between the NestJS cache and the underlying Redis eviction policy.',
    techs: ['NestJS', 'Redis'], markers: ['dm-be-05', 'dm-rt-01'],
  },
  {
    id: 'ix-kafka-redis', name: 'kafka_redis_dedup',
    description: 'Kafka consumer dedup via Redis SET NX. Builders use Redis as a seen-set but must handle TTL expiry races when reprocessing old offsets.',
    techs: ['Kafka', 'Redis'], markers: ['dm-dist-04', 'dm-dp-03'],
  },
];

export const FAKER_SIGNALS: Array<{ id: string; text: string; contrasts: string }> = [
  { id: 'fk-01', text: '"I just used the library / asked the AI"', contrasts: 'dm-ml-05' },
  { id: 'fk-02', text: '"it just works because of React"', contrasts: 'dm-fe-02' },
  { id: 'fk-03', text: '"the queue handles it"', contrasts: 'dm-dist-03' },
  { id: 'fk-04', text: '"Postgres is fast"', contrasts: 'dm-be-01' },
  { id: 'fk-05', text: '"smart contracts are immutable so it is safe"', contrasts: 'dm-bc-01' },
];

export const SEED_QUESTIONS: SeedQuestion[] = [
  // distributed_system
  { id: 'q-dist-01', text: 'Walk me through how a duplicate request to your write endpoint is handled end-to-end.', difficulty: 3, archetype: 'distributed_system', markers: ['dm-dist-01', 'dm-be-05'] },
  { id: 'q-dist-02', text: 'If your job queue depth doubles unexpectedly, what observable signal do you act on first, and what action follows?', difficulty: 4, archetype: 'distributed_system', markers: ['dm-dist-03'] },
  { id: 'q-dist-03', text: 'When two consumers process the same message, how does your system decide whose result wins?', difficulty: 4, archetype: 'distributed_system', markers: ['dm-dist-04', 'dm-dist-01'] },
  { id: 'q-dist-04', text: 'Pick a node in your topology that, if it died right now, would cause the worst user-visible failure. Why that one?', difficulty: 5, archetype: 'distributed_system', markers: ['dm-dist-05', 'dm-dist-02'] },

  // ml_system
  { id: 'q-ml-01', text: 'How did you build the eval set, and what stops your eval set from leaking into your training/finetune data?', difficulty: 4, archetype: 'ml_system', markers: ['dm-ml-01'] },
  { id: 'q-ml-02', text: 'You want to swap your embedding model. Walk through the migration without downtime.', difficulty: 4, archetype: 'ml_system', markers: ['dm-ml-02'] },
  { id: 'q-ml-03', text: 'What is your current prompt cache hit-rate, and what change would move it 10 points?', difficulty: 3, archetype: 'ml_system', markers: ['dm-ml-03'] },
  { id: 'q-ml-04', text: 'Show the smallest concrete change you made that cut tokens without measurable accuracy loss.', difficulty: 3, archetype: 'ml_system', markers: ['dm-ml-05'] },
  { id: 'q-ml-05', text: 'When the model hallucinates a fact, what specifically in your system catches it before the user sees it?', difficulty: 4, archetype: 'ml_system', markers: ['dm-ml-04'] },

  // frontend_system
  { id: 'q-fe-01', text: 'Describe an SSR hydration mismatch you actually shipped, why it happened, and how you found it.', difficulty: 3, archetype: 'frontend_system', markers: ['dm-fe-01'] },
  { id: 'q-fe-02', text: 'Pick one component you memoized and explain what changed in the render trace afterward.', difficulty: 3, archetype: 'frontend_system', markers: ['dm-fe-02'] },
  { id: 'q-fe-03', text: 'How did you decide which routes to code-split, and what is the budget?', difficulty: 3, archetype: 'frontend_system', markers: ['dm-fe-03'] },
  { id: 'q-fe-04', text: 'Walk me through a keyboard-only path through your most important flow. What broke when you tried it?', difficulty: 4, archetype: 'frontend_system', markers: ['dm-fe-04'] },

  // backend_api_system
  { id: 'q-be-01', text: 'Last time your DB connection pool saturated, what was the symptom and what fixed it?', difficulty: 3, archetype: 'backend_api_system', markers: ['dm-be-01'] },
  { id: 'q-be-02', text: 'Show me a query in this repo that would N+1 under load, and the version that does not.', difficulty: 3, archetype: 'backend_api_system', markers: ['dm-be-02'] },
  { id: 'q-be-03', text: 'When two users update the same record, who wins, and how do they find out?', difficulty: 4, archetype: 'backend_api_system', markers: ['dm-be-03'] },
  { id: 'q-be-04', text: 'How do you revoke an issued auth token before it expires?', difficulty: 3, archetype: 'backend_api_system', markers: ['dm-be-04'] },

  // data_pipeline_system
  { id: 'q-dp-01', text: 'A backfill of 30 days of events arrives 2 hours late. What does your pipeline do?', difficulty: 4, archetype: 'data_pipeline_system', markers: ['dm-dp-01', 'dm-dp-03'] },
  { id: 'q-dp-02', text: 'You add a non-null column to an event. Walk through the deploy without breaking consumers.', difficulty: 4, archetype: 'data_pipeline_system', markers: ['dm-dp-02'] },

  // real_time_system
  { id: 'q-rt-01', text: 'A client reconnects after 30s offline. Describe what they see and how the server resumes their stream.', difficulty: 4, archetype: 'real_time_system', markers: ['dm-rt-02', 'dm-rt-03'] },
  { id: 'q-rt-02', text: 'When you scale your socket fleet to N pods, how does a message from pod 1 reach a user pinned to pod N?', difficulty: 4, archetype: 'real_time_system', markers: ['dm-rt-01'] },

  // blockchain_system
  { id: 'q-bc-01', text: 'Walk me through the reentrancy surface in this contract and your specific defense.', difficulty: 4, archetype: 'blockchain_system', markers: ['dm-bc-01'] },
  { id: 'q-bc-02', text: 'Where in this contract does gas cost grow with input size, and what cap protects users?', difficulty: 4, archetype: 'blockchain_system', markers: ['dm-bc-02'] },

  // infra_devops_system
  { id: 'q-do-01', text: 'A bad image rolls out at 3am. Describe exactly what happens between push and rollback in your pipeline.', difficulty: 4, archetype: 'infra_devops_system', markers: ['dm-do-02'] },
  { id: 'q-do-02', text: 'How does a leaked secret get rotated everywhere it is mounted?', difficulty: 4, archetype: 'infra_devops_system', markers: ['dm-do-03'] },

  // ── Cross-technology interaction questions ──────────────────────────────────
  // These are seeded by the Interaction layer. They only surface when the repo uses
  // BOTH listed technologies. A candidate who did not personally wire the integration
  // will fail these — they require hands-on knowledge of the failure modes at the boundary.
  { id: 'q-ix-01', text: 'Both your API and your React frontend write to Redis. Walk through a scenario where these two writers produce a stale read for a user, and the exact line of code or config that prevents it in your repo.', difficulty: 4, archetype: 'real_time_system', markers: ['dm-fe-05', 'dm-rt-01'] },
  { id: 'q-ix-02', text: 'Your Kafka consumer writes to Postgres. If the DB write succeeds but the Kafka offset commit fails, what exactly happens on the next consumer start? Walk through your deduplication guard with the specific table or key you use.', difficulty: 5, archetype: 'distributed_system', markers: ['dm-dist-01', 'dm-dist-04', 'dm-dp-03'] },
  { id: 'q-ix-03', text: 'When your BullMQ job retries after a worker crash, what prevents the same side-effect from happening twice in your database? Name the specific Postgres column or Redis key involved.', difficulty: 4, archetype: 'distributed_system', markers: ['dm-dist-01', 'dm-dist-03'] },
  { id: 'q-ix-04', text: 'You scale your Socket.IO server from 1 to 3 pods. A user connected to pod 1 sends a message; a user on pod 3 must receive it. Walk through exactly how that routing works in your repo, including the Redis adapter config and what breaks if the Redis connection drops.', difficulty: 4, archetype: 'real_time_system', markers: ['dm-rt-01', 'dm-rt-02'] },
  { id: 'q-ix-05', text: 'Your LangChain chain calls the LLM twice per request. Show the smallest change you made that reduced per-request token spend, and what cache hit-rate you measured before and after.', difficulty: 3, archetype: 'ml_system', markers: ['dm-ml-03', 'dm-ml-05'] },
  { id: 'q-ix-06', text: 'Prisma generated N+1 queries for a relation in your schema. How did you detect it in production, and which Prisma feature resolved it without rewriting the business logic?', difficulty: 3, archetype: 'backend_api_system', markers: ['dm-be-01', 'dm-be-02'] },
  { id: 'q-ix-07', text: 'A Kubernetes pod restarts and the mounted secret is stale because it was rotated 10 minutes earlier. Walk through your exact mechanism for the pod to pick up the new secret without a full redeployment, and the window during which the old secret is still in use.', difficulty: 5, archetype: 'infra_devops_system', markers: ['dm-do-01', 'dm-do-03'] },
  { id: 'q-ix-08', text: 'Your Next.js ISR page reads from Redis for the cached version, but a background worker just updated Postgres. How does Redis learn about the change, and what does a user see in the revalidation window? What is the worst-case stale duration?', difficulty: 4, archetype: 'frontend_system', markers: ['dm-fe-01', 'dm-rt-01'] },
  { id: 'q-ix-09', text: 'When your Fastify server restarts, Redis still holds cached responses from the previous instance. Walk through the cache invalidation handshake — does the new instance respect stale entries, and how do you version or tag cache keys to prevent cross-deploy contamination?', difficulty: 4, archetype: 'backend_api_system', markers: ['dm-be-05', 'dm-rt-01'] },
  { id: 'q-ix-10', text: 'You have Kafka and Redis in the same pipeline. A Kafka message is processed, the result written to Redis, but Redis rejects the write (OOM). How does your system detect the failure, and what happens to the Kafka offset — is it committed or not?', difficulty: 5, archetype: 'distributed_system', markers: ['dm-dist-04', 'dm-dp-03'] },
];

// Map archetype -> markers (used by seed)
export function markersByArchetype(): Record<Archetype, string[]> {
  const out: Record<string, string[]> = {};
  const prefix: Record<Archetype, string> = {
    distributed_system: 'dm-dist',
    ml_system: 'dm-ml',
    frontend_system: 'dm-fe',
    backend_api_system: 'dm-be',
    data_pipeline_system: 'dm-dp',
    real_time_system: 'dm-rt',
    blockchain_system: 'dm-bc',
    infra_devops_system: 'dm-do',
  };
  for (const [arch, p] of Object.entries(prefix)) {
    out[arch] = DEPTH_MARKERS.filter((m) => m.id.startsWith(p)).map((m) => m.id);
  }
  return out as Record<Archetype, string[]>;
}
