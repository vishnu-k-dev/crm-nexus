import type { RepoSnapshot } from './repoParser.js';

// Tech name -> normalized canonical Tech vertex name + category.
// Built from scratch for the hackathon — public-knowledge mappings only.
const TECH_REGISTRY: Record<string, { name: string; category: string }> = {
  // frontend
  react: { name: 'React', category: 'frontend' },
  'react-dom': { name: 'React', category: 'frontend' },
  next: { name: 'Next.js', category: 'frontend' },
  vue: { name: 'Vue', category: 'frontend' },
  svelte: { name: 'Svelte', category: 'frontend' },
  '@angular/core': { name: 'Angular', category: 'frontend' },
  vite: { name: 'Vite', category: 'frontend' },
  tailwindcss: { name: 'Tailwind', category: 'frontend' },
  // backend
  express: { name: 'Express', category: 'backend' },
  fastify: { name: 'Fastify', category: 'backend' },
  koa: { name: 'Koa', category: 'backend' },
  nestjs: { name: 'NestJS', category: 'backend' },
  '@nestjs/core': { name: 'NestJS', category: 'backend' },
  fastapi: { name: 'FastAPI', category: 'backend' },
  django: { name: 'Django', category: 'backend' },
  flask: { name: 'Flask', category: 'backend' },
  spring: { name: 'Spring', category: 'backend' },
  // db
  postgres: { name: 'Postgres', category: 'database' },
  pg: { name: 'Postgres', category: 'database' },
  psycopg2: { name: 'Postgres', category: 'database' },
  mysql: { name: 'MySQL', category: 'database' },
  mongoose: { name: 'MongoDB', category: 'database' },
  pymongo: { name: 'MongoDB', category: 'database' },
  redis: { name: 'Redis', category: 'database' },
  ioredis: { name: 'Redis', category: 'database' },
  prisma: { name: 'Prisma', category: 'database' },
  '@supabase/supabase-js': { name: 'Supabase', category: 'database' },
  supabase: { name: 'Supabase', category: 'database' },
  // realtime / queue
  bullmq: { name: 'BullMQ', category: 'realtime' },
  'socket.io': { name: 'Socket.IO', category: 'realtime' },
  kafkajs: { name: 'Kafka', category: 'realtime' },
  rabbitmq: { name: 'RabbitMQ', category: 'realtime' },
  'aiokafka': { name: 'Kafka', category: 'realtime' },
  // ai
  openai: { name: 'OpenAI', category: 'ai' },
  '@anthropic-ai/sdk': { name: 'Anthropic', category: 'ai' },
  anthropic: { name: 'Anthropic', category: 'ai' },
  langchain: { name: 'LangChain', category: 'ai' },
  llama_index: { name: 'LlamaIndex', category: 'ai' },
  pytorch: { name: 'PyTorch', category: 'ai' },
  torch: { name: 'PyTorch', category: 'ai' },
  tensorflow: { name: 'TensorFlow', category: 'ai' },
  transformers: { name: 'Transformers', category: 'ai' },
  // devops
  docker: { name: 'Docker', category: 'devops' },
  kubernetes: { name: 'Kubernetes', category: 'devops' },
  terraform: { name: 'Terraform', category: 'devops' },
  // mobile
  'react-native': { name: 'ReactNative', category: 'mobile' },
  expo: { name: 'Expo', category: 'mobile' },
  flutter: { name: 'Flutter', category: 'mobile' },
  // blockchain
  ethers: { name: 'Ethers', category: 'blockchain' },
  web3: { name: 'Web3', category: 'blockchain' },
  hardhat: { name: 'Hardhat', category: 'blockchain' },
  // observability
  '@sentry/node': { name: 'Sentry', category: 'devops' },
  prometheus_client: { name: 'Prometheus', category: 'devops' },
};

const FILE_HINTS: Array<[RegExp, { name: string; category: string }]> = [
  [/^Dockerfile/i, { name: 'Docker', category: 'devops' }],
  [/^docker-compose\.ya?ml$/i, { name: 'Docker', category: 'devops' }],
  [/\.tf$/i, { name: 'Terraform', category: 'devops' }],
  [/k8s|kubernetes|deployment\.ya?ml/i, { name: 'Kubernetes', category: 'devops' }],
  [/\.sol$/i, { name: 'Solidity', category: 'blockchain' }],
  [/\.swift$/i, { name: 'iOS', category: 'mobile' }],
  [/\.kt$/i, { name: 'Android', category: 'mobile' }],
];

export interface ResolvedTech { name: string; category: string; weight: number }

export function resolveTechs(repo: RepoSnapshot): ResolvedTech[] {
  const counts = new Map<string, { category: string; weight: number }>();
  const bump = (name: string, category: string, w: number): void => {
    const cur = counts.get(name);
    if (cur) cur.weight += w;
    else counts.set(name, { category, weight: w });
  };

  for (const dep of repo.dependencies) {
    const t = TECH_REGISTRY[dep.toLowerCase()];
    if (t) bump(t.name, t.category, 2);
  }
  for (const path of repo.topPaths) {
    for (const [re, t] of FILE_HINTS) if (re.test(path)) bump(t.name, t.category, 0.5);
  }
  // language signal
  const totalLang = Object.values(repo.languages).reduce((a, b) => a + b, 0) || 1;
  for (const [lang, bytes] of Object.entries(repo.languages)) {
    const share = bytes / totalLang;
    if (share < 0.05) continue;
    bump(lang, 'language', share * 3);
  }
  return [...counts.entries()].map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.weight - a.weight);
}

// 8 archetypes — the same set every team will recognize from RAG literature.
export const ARCHETYPES = [
  'distributed_system',
  'ml_system',
  'frontend_system',
  'backend_api_system',
  'data_pipeline_system',
  'real_time_system',
  'blockchain_system',
  'infra_devops_system',
] as const;
export type Archetype = typeof ARCHETYPES[number];

const TECH_TO_DOMAIN: Record<string, Partial<Record<Archetype, number>>> = {
  React:        { frontend_system: 1.0 },
  'Next.js':    { frontend_system: 0.9, backend_api_system: 0.3 },
  Vue:          { frontend_system: 1.0 },
  Svelte:       { frontend_system: 1.0 },
  Angular:      { frontend_system: 1.0 },
  Tailwind:     { frontend_system: 0.5 },
  Express:      { backend_api_system: 1.0 },
  Fastify:      { backend_api_system: 1.0 },
  NestJS:       { backend_api_system: 1.0 },
  FastAPI:      { backend_api_system: 1.0 },
  Django:       { backend_api_system: 1.0 },
  Flask:        { backend_api_system: 1.0 },
  Spring:       { backend_api_system: 1.0 },
  Postgres:     { backend_api_system: 0.6, data_pipeline_system: 0.3 },
  MySQL:        { backend_api_system: 0.6 },
  MongoDB:      { backend_api_system: 0.5 },
  Redis:        { real_time_system: 0.7, distributed_system: 0.6, backend_api_system: 0.3 },
  Prisma:       { backend_api_system: 0.5 },
  Supabase:     { backend_api_system: 0.7, frontend_system: 0.3 },
  BullMQ:       { distributed_system: 0.8, real_time_system: 0.5 },
  'Socket.IO':  { real_time_system: 1.0 },
  Kafka:        { distributed_system: 1.0, data_pipeline_system: 0.9, real_time_system: 0.5 },
  RabbitMQ:     { distributed_system: 0.9 },
  OpenAI:       { ml_system: 0.9 },
  Anthropic:    { ml_system: 0.9 },
  LangChain:    { ml_system: 1.0 },
  LlamaIndex:   { ml_system: 1.0 },
  PyTorch:      { ml_system: 1.0 },
  TensorFlow:   { ml_system: 1.0 },
  Transformers: { ml_system: 1.0 },
  Docker:       { infra_devops_system: 0.8 },
  Kubernetes:   { infra_devops_system: 1.0, distributed_system: 0.6 },
  Terraform:    { infra_devops_system: 1.0 },
  Solidity:     { blockchain_system: 1.0 },
  Ethers:       { blockchain_system: 1.0 },
  Web3:         { blockchain_system: 1.0 },
  Hardhat:      { blockchain_system: 1.0 },
  ReactNative:  { frontend_system: 0.8 },
  Expo:         { frontend_system: 0.8 },
  Flutter:      { frontend_system: 0.8 },
  Sentry:       { infra_devops_system: 0.4 },
  Prometheus:   { infra_devops_system: 0.7, distributed_system: 0.3 },
};

export interface ClassifiedDomain { name: Archetype; score: number }

export function classifyDomains(techs: ResolvedTech[]): ClassifiedDomain[] {
  const scores: Record<Archetype, number> = Object.fromEntries(ARCHETYPES.map((a) => [a, 0])) as Record<Archetype, number>;
  for (const t of techs) {
    const map = TECH_TO_DOMAIN[t.name];
    if (!map) continue;
    for (const [d, w] of Object.entries(map) as [Archetype, number][]) {
      scores[d] += t.weight * w;
    }
  }
  return ARCHETYPES.map((name) => ({ name, score: scores[name] }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function techToDomainEdges(): Array<{ tech: string; domain: Archetype; confidence: number }> {
  const out: Array<{ tech: string; domain: Archetype; confidence: number }> = [];
  for (const [tech, m] of Object.entries(TECH_TO_DOMAIN)) {
    for (const [d, c] of Object.entries(m) as [Archetype, number][]) {
      out.push({ tech, domain: d, confidence: c });
    }
  }
  return out;
}

export function knownTechs(): Array<{ name: string; category: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; category: string }> = [];
  for (const v of Object.values(TECH_REGISTRY)) {
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    out.push({ name: v.name, category: v.category });
  }
  return out;
}
