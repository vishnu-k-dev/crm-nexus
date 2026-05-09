/**
 * Downloads Wikipedia tech/CS articles and saves them to data/wikipedia/.
 * Run: npm run download-wiki
 * Target: ~300 articles, ~2.5M tokens.
 *
 * Fixes vs v1:
 *   - Uses actual Wikipedia titles (not URL-encoded slugs)
 *   - encodeURIComponent() on the titles parameter
 *   - 500ms delay + 3-attempt retry for rate limit resilience
 *   - Logs HTTP errors instead of silently dropping
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '../data/wikipedia');
const DELAY_MS  = 500;
const MIN_CHARS = 500;

// Actual Wikipedia article titles (spaces, not underscores; real special chars).
// Chosen for maximum entity-relationship density — each links to multiple others.
const ARTICLES = [
  // Programming languages
  'Python (programming language)', 'JavaScript', 'TypeScript', 'Rust (programming language)',
  'Go (programming language)', 'Java (programming language)', 'C++', 'Ruby (programming language)',
  'Kotlin (programming language)', 'Swift (programming language)', 'Scala (programming language)',
  'Haskell (programming language)', 'Elixir (programming language)', 'Clojure',
  'Lua (programming language)', 'PHP', 'Perl', 'R (programming language)',
  'Julia (programming language)', 'Dart (programming language)',
  'C (programming language)', 'C# (programming language)', 'Erlang (programming language)',
  'Lisp (programming language)', 'Fortran', 'COBOL', 'Assembly language', 'MATLAB',

  // Web frameworks & libraries
  'React (software)', 'Angular (web framework)', 'Vue.js', 'Next.js', 'Svelte',
  'Django (web framework)', 'Flask (web framework)', 'Ruby on Rails', 'Laravel',
  'Spring Framework', 'Express.js', 'ASP.NET', 'Ember.js', 'Backbone.js',

  // Databases
  'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Redis', 'Apache Cassandra',
  'Elasticsearch', 'Neo4j', 'Apache HBase', 'CouchDB', 'Amazon DynamoDB',
  'MariaDB', 'Oracle Database', 'Microsoft SQL Server', 'IBM Db2',

  // Cloud & Infrastructure
  'Amazon Web Services', 'Microsoft Azure', 'Google Cloud Platform',
  'Docker (software)', 'Kubernetes', 'Terraform (software)', 'Ansible (software)',
  'Jenkins (software)', 'Nginx', 'Apache HTTP Server',
  'Cloudflare', 'Heroku', 'DigitalOcean',

  // AI / ML
  'TensorFlow', 'PyTorch', 'scikit-learn', 'Keras', 'Hugging Face',
  'OpenAI', 'Anthropic (company)', 'DeepMind', 'BERT (language model)',
  'GPT-4', 'Large language model', 'Transformer (deep learning architecture)',
  'Convolutional neural network', 'Recurrent neural network',
  'Generative adversarial network', 'Reinforcement learning',
  'Natural language processing', 'Computer vision',
  'Retrieval-augmented generation', 'Vector database',

  // Tech companies
  'Google', 'Microsoft', 'Apple Inc.', 'Meta Platforms', 'Amazon (company)',
  'Netflix', 'Uber', 'Airbnb', 'Twitter', 'LinkedIn', 'Stripe (company)',
  'Shopify', 'Salesforce', 'Adobe Inc.', 'Oracle Corporation', 'IBM',
  'Intel', 'Nvidia', 'Qualcomm', 'ARM Holdings',
  'GitHub', 'GitLab', 'Atlassian', 'JetBrains', 'HashiCorp',
  'Databricks', 'Snowflake Inc.', 'MongoDB Inc.', 'Elastic NV',

  // Algorithms & Data Structures
  'Algorithm', 'Big O notation', 'Sorting algorithm', 'Hash table',
  'Binary search tree', 'Dynamic programming', 'Greedy algorithm',
  "Dijkstra's algorithm", 'Breadth-first search', 'Depth-first search',
  'PageRank', 'MapReduce',

  // CS concepts
  'Microservices', 'Representational state transfer', 'GraphQL',
  'WebSocket', 'Serverless computing', 'Event-driven architecture',
  'Message queue', 'Apache Kafka', 'RabbitMQ', 'Apache Spark', 'Apache Hadoop',
  'Distributed computing', 'CAP theorem', 'ACID (computer science)',
  'Eventual consistency', 'Load balancing (computing)', 'Content delivery network',
  'DevOps', 'Continuous integration', 'Agile software development',
  'Test-driven development', 'Domain-driven design',
  'Functional programming', 'Object-oriented programming',
  'Concurrency (computer science)', 'Garbage collection (computer science)',
  'Virtual machine', 'Just-in-time compilation',

  // Security
  'Cybersecurity', 'Encryption', 'Transport Layer Security', 'OAuth',
  'JSON Web Token', 'SQL injection', 'Cross-site scripting',
  'Public-key cryptography',

  // Dev tooling
  'Git', 'Semantic versioning', 'npm (software)', 'Webpack',
  'Visual Studio Code', 'IntelliJ IDEA', 'Vim',

  // Networking
  'Internet Protocol', 'Transmission Control Protocol', 'Hypertext Transfer Protocol',
  'Domain Name System', 'IPv6',

  // People
  'Linus Torvalds', 'Guido van Rossum', 'Brendan Eich', 'Anders Hejlsberg',
  'Yann LeCun', 'Geoffrey Hinton', 'Yoshua Bengio',
  'Tim Berners-Lee', 'Alan Turing', 'Donald Knuth', 'Edsger W. Dijkstra',
  'Ken Thompson', 'Dennis Ritchie', 'Bjarne Stroustrup', 'James Gosling',
  'Larry Page', 'Sergey Brin', 'Satya Nadella', 'Sundar Pichai',

  // OS
  'Linux', 'Unix', 'Windows NT', 'macOS', 'Android (operating system)',
  'iOS', 'Ubuntu', 'Debian',

  // More runtimes & tools
  'Node.js', 'Deno (software)', 'Electron (software)', 'React Native',
  'Flutter (software)', 'Tailwind CSS', 'Bootstrap (front-end framework)',
  'Figma', 'WebAssembly', 'gRPC', 'Protocol Buffers',
  'Apache Flink', 'Apache Storm', 'RocksDB', 'etcd',
  'FAISS', 'LangChain',

  // Graph DBs & vector
  'Graph database', 'TigerGraph', 'Knowledge graph',

  // Open-source & community
  'Open-source software', 'Free software movement', 'Linux Foundation',
  'Apache Software Foundation', 'Stack Overflow', 'Hacker News',

  // Long high-level articles (dense, 40-80k chars each)
  'Artificial intelligence', 'Machine learning', 'Deep learning',
  'Computer science', 'Software engineering', 'History of computing',
  'Cloud computing', 'Data science', 'Computer programming',
  'Software development', 'Distributed version control',
  'Computer network', 'Internet', 'World Wide Web',
  'Operating system', 'Compiler', 'Database', 'Computer security',
  'Parallel computing', 'Quantum computing',

  // More CS concepts
  'Recursion (computer science)', 'Memoization', 'Monad (functional programming)',
  'Lambda calculus', 'Type system', 'Static program analysis',
  'Formal verification', 'Continuous delivery', 'Infrastructure as code',
  'Service mesh', 'API gateway', 'Circuit breaker (computing)',
  'Blue–green deployment', 'Feature flag', 'Chaos engineering',
  'Site reliability engineering', 'Observability (software)',
  'Distributed tracing', 'Log management',

  // More databases & storage
  'ACID (computer science)', 'Database transaction', 'Database index',
  'Query optimization', 'Object–relational mapping',
  'Data warehouse', 'Online analytical processing',
  'Extract, transform, load', 'Data lake', 'Apache Parquet',
  'Column-oriented DBMS', 'In-memory database',

  // More networking & protocols
  'HTTP/2', 'HTTP/3', 'QUIC', 'WebRTC', 'MQTT',
  'Remote procedure call', 'Service-oriented architecture',
  'Zero-trust security', 'Virtual private network',
  'Firewall (computing)', 'Intrusion detection system',

  // More AI/ML specifics
  'Attention (machine learning)', 'Generative pre-trained transformer',
  'Word2vec', 'Embedding (machine learning)',
  'Gradient descent', 'Backpropagation', 'Overfitting',
  'Cross-validation (statistics)', 'Hyperparameter optimization',
  'Transfer learning', 'Fine-tuning (deep learning)',
  'Prompt engineering', 'Hallucination (artificial intelligence)',
  'Responsible AI', 'Explainable artificial intelligence',

  // More companies
  'SpaceX', 'Tesla, Inc.', 'Palantir Technologies', 'Cloudflare', 'Vercel',
  'Figma (company)', 'Notion (productivity software)', 'Linear (software)',
  'Supabase', 'PlanetScale', 'Neon (database company)',
  'Hugging Face (company)', 'Stability AI', 'Cohere', 'Mistral AI',
  'Perplexity AI', 'Midjourney',

  // More people in tech
  'Sam Altman', 'Greg Brockman', 'Ilya Sutskever',
  'Andrej Karpathy', 'Demis Hassabis', 'Jeff Bezos',
  'Elon Musk', 'Mark Zuckerberg', 'Bill Gates', 'Steve Jobs',
  'Linus Torvalds', 'Vint Cerf', 'John McCarthy',
  'Claude Shannon', 'Grace Hopper', 'Ada Lovelace',
  'John von Neumann', 'Turing Award',

  // More tools & platforms
  'Visual Studio', 'Eclipse (software)', 'Xcode',
  'Android Studio', 'Postman (software)', 'Insomnia (software)',
  'Docker Hub', 'Helm (package manager)', 'Argo CD',
  'Prometheus (software)', 'Grafana', 'Datadog', 'New Relic',
  'Sentry (software)', 'PagerDuty',

  // Programming paradigms & theory
  'Functional programming', 'Object-oriented programming',
  'Reactive programming', 'Aspect-oriented programming',
  'Generic programming', 'Metaprogramming',
  'Dependency injection', 'Inversion of control',
  'Design pattern (computer science)', 'Anti-pattern',
  'Technical debt', 'Code refactoring', 'Code review',
  'Pair programming', 'Mob programming',

  // Data engineering
  'Apache Airflow', 'dbt (software)', 'Apache Beam',
  'Databricks', 'Snowflake (company)',
  'Real-time computing', 'Stream processing',
  'Batch processing', 'Lambda architecture', 'Kappa architecture',

  // Mobile & frontend
  'Progressive web application', 'Single-page application',
  'Server-side rendering', 'Static site generator',
  'Web accessibility', 'Responsive web design',
  'Material Design', 'Human interface guidelines',

  // Blockchain (briefly)
  'Blockchain', 'Smart contract', 'Ethereum', 'Bitcoin',

  // Miscellaneous influential
  'Unix philosophy', 'Conway\'s law', 'Amdahl\'s law', 'Moore\'s law',
  'Metcalfe\'s law',

  // More programming languages
  'Zig (programming language)', 'Nim (programming language)',
  'Crystal (programming language)', 'Racket (programming language)',
  'OCaml', 'Common Lisp', 'Scheme (programming language)',
  'APL (programming language)', 'AWK', 'Bash (Unix shell)',
  'PowerShell', 'Groovy (programming language)',
  'CoffeeScript', 'Elm (programming language)',
  'PureScript', 'ReScript', 'Reason (programming language)',
  'Hack (programming language)', 'Pony (programming language)',
  'V (programming language)',

  // More frameworks
  'Nuxt.js', 'SvelteKit', 'Astro (web framework)',
  'Remix (web framework)', 'Qwik', 'Solid (JavaScript library)',
  'Preact', 'Alpine.js', 'HTMX',
  'FastAPI', 'Starlette', 'Tornado (web server)',
  'Twisted (software)', 'Celery (software)',
  'Phoenix (web framework)', 'Sinatra (software)',
  'Gin (web framework)', 'Echo (web framework)',
  'Fiber (web framework)', 'NestJS',
  'Hapi.js', 'Koa (web framework)',

  // More databases
  'TimescaleDB', 'InfluxDB', 'ClickHouse',
  'DuckDB', 'Apache Druid', 'Apache Pinot',
  'VoltDB', 'FaunaDB', 'SurrealDB',
  'Weaviate', 'Pinecone (vector database)', 'Milvus',
  'Qdrant', 'Chroma (database)', 'LanceDB',
  'Apache Solr', 'OpenSearch', 'Meilisearch',
  'Valkey (software)', 'KeyDB',

  // More cloud/devops tools
  'Pulumi', 'AWS CloudFormation', 'Chef (software)',
  'Puppet (software)', 'SaltStack',
  'Nomad (software)', 'Consul (software)',
  'Vault (software)', 'Envoy (software)',
  'Istio', 'Linkerd', 'Traefik (software)',
  'HAProxy', 'Caddy (web server)',
  'GitHub Actions', 'GitLab CI/CD', 'CircleCI',
  'Buildkite', 'Drone (software)',
  'Spinnaker (software)', 'Tekton',
  'OpenTelemetry', 'Jaeger (software)',
  'Zipkin', 'Loki (software)', 'Tempo (software)',

  // More AI/ML tools & concepts
  'Stable Diffusion', 'DALL-E', 'Midjourney',
  'Llama (language model)', 'Mistral AI',
  'Gemini (language model)', 'Claude (language model)',
  'LangChain', 'LlamaIndex', 'Haystack (NLP framework)',
  'Semantic search', 'Knowledge graph',
  'Graph neural network', 'Variational autoencoder',
  'Diffusion model', 'Contrastive learning',
  'Few-shot learning', 'Zero-shot learning',
  'Federated learning', 'AutoML',
  'Neural architecture search', 'Quantization (machine learning)',
  'Model compression', 'Knowledge distillation',
  'Model serving', 'MLflow', 'Kubeflow',
  'Apache MXNet', 'Caffe (software)', 'Theano (software)',
  'JAX (software)', 'Flax (neural network library)',

  // More companies
  'Twilio', 'Segment (company)', 'Amplitude (company)',
  'Mixpanel', 'Intercom (company)', 'Zendesk',
  'Freshworks', 'HubSpot', 'Marketo',
  'Confluent (company)', 'DataStax', 'Couchbase',
  'SingleStore', 'PingCAP', 'YugabyteDB',
  'Cockroach Labs', 'PlanetScale', 'Neon (database company)',
  'Railway (platform)', 'Fly.io', 'Render (company)',
  'Cyclic (platform)', 'Deno Deploy',
  'Cloudflare Workers', 'Fastly',
  'Akamai Technologies', 'Limelight Networks',
  'Roblox', 'Unity Technologies', 'Unreal Engine',
  'Epic Games', 'Valve Corporation',

  // More people
  'Linus Torvalds', 'Richard Stallman', 'Brian Kernighan',
  'Rob Pike', 'Dave Cheney',
  'Ryan Dahl', 'Guillermo Rauch',
  'Evan You', 'Rich Harris', 'Fred Schott',
  'Dan Abramov', 'Sebastian McKenzie',
  'Theo Browne', 'ThePrimeagen',
  'Martin Fowler', 'Kent Beck',
  'Robert C. Martin', 'Eric Evans',
  'Werner Vogels', 'James Hamilton',
  'Jeff Dean', 'Sanjay Ghemawat',
  'Patrick Collison', 'John Collison',
  'Nat Friedman', 'Thomas Dohmke',
  'Mitchell Hashimoto', 'Armon Dadgar',

  // Systems & architecture
  'Microkernel', 'Monolithic kernel', 'Hypervisor',
  'Container (virtualization)', 'Unikernel',
  'Service-level agreement', 'High availability',
  'Disaster recovery', 'Business continuity planning',
  'Zero-downtime deployment', 'Canary release',
  'A/B testing', 'Feature toggle', 'Dark launch',
  'Rollback (data management)', 'Database migration',
  'Schema migration', 'Zero-trust architecture',

  // Software project management
  'Scrum (software development)', 'Kanban (development)',
  'Extreme programming', 'Lean software development',
  'Software project management', 'Technical specification',
  'Software requirements specification', 'User story',
  'Sprint (software development)', 'Retrospective (software development)',
  'Velocity (software development)',

  // Extra long articles to push past 2.5M tokens
  'Information technology', 'Software', 'Programming language',
  'Application programming interface', 'Web development',
  'Mobile app development', 'Game development', 'Robotics',
  'Internet of things', 'Edge computing', 'Fog computing',
  '5G', 'Augmented reality', 'Virtual reality', 'Mixed reality',
  'Digital transformation', 'Platform economy',
  'Network effect', 'Two-sided market',

  // Miscellaneous important topics
  'SOLID', 'DRY principle', 'KISS principle', 'YAGNI',
  'Separation of concerns', 'Single responsibility principle',
  'Open–closed principle', 'Liskov substitution principle',
  'Interface segregation principle', 'Dependency inversion principle',
  'Coupling (computer programming)', 'Cohesion (computer science)',
  'Code smell', 'Cyclomatic complexity',
  'Software metrics', 'Software testing',
  'Unit testing', 'Integration testing', 'End-to-end testing',
  'Mutation testing', 'Property-based testing',
  'Behavior-driven development', 'Acceptance test-driven development',
];

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchArticle(title: string, attempt = 1): Promise<{ title: string; content: string; url: string } | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=true&exsectionformat=plain&format=json&redirects=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'TechProbeGraphRAG/1.0 (hackathon)' } });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 4) {
        await sleep(attempt * 2000);
        return fetchArticle(title, attempt + 1);
      }
      console.error(`   HTTP ${res.status} after ${attempt} attempts: ${title}`);
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json() as {
      query: { pages: Record<string, { title: string; extract?: string; missing?: boolean }> }
    };
    const page = Object.values(data.query.pages)[0];
    if (!page || page.missing || !page.extract || page.extract.length < MIN_CHARS) return null;
    return {
      title: page.title,
      content: page.extract,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    };
  } catch (err) {
    if (attempt < 4) {
      await sleep(attempt * 2000);
      return fetchArticle(title, attempt + 1);
    }
    console.error(`   Fetch error for ${title}: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const unique = [...new Set(ARTICLES)];
  let downloaded = 0, skipped = 0;
  let totalChars = 0;
  const manifest: Array<{ title: string; file: string; url: string; chars: number }> = [];

  console.log(`\n[wiki] Downloading ${unique.length} articles → ${OUT_DIR}\n`);

  for (const [i, title] of unique.entries()) {
    const safeFile = `${title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}.txt`;
    const outPath = join(OUT_DIR, safeFile);

    // Use cache if exists
    if (existsSync(outPath)) {
      const chars = readFileSync(outPath, 'utf8').length;
      manifest.push({ title, file: safeFile, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`, chars });
      totalChars += chars;
      process.stdout.write(`[${i + 1}/${unique.length}] ⏭  ${title} (cached)\n`);
      downloaded++;
      continue;
    }

    const article = await fetchArticle(title);
    if (!article) {
      process.stdout.write(`[${i + 1}/${unique.length}] ✗  ${title}\n`);
      skipped++;
    } else {
      const content = `TITLE: ${article.title}\nURL: ${article.url}\n\n${article.content}`;
      writeFileSync(outPath, content, 'utf8');
      manifest.push({ title: article.title, file: safeFile, url: article.url, chars: content.length });
      totalChars += content.length;
      downloaded++;
      process.stdout.write(`[${i + 1}/${unique.length}] ✓  ${article.title} (${(content.length / 1000).toFixed(0)}k chars)\n`);
    }

    if (i < unique.length - 1) await sleep(DELAY_MS);
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const approxTokens = Math.round(totalChars / 4);
  console.log(`\n── Download complete ──`);
  console.log(`Downloaded: ${downloaded} | Skipped: ${skipped}`);
  console.log(`Total chars: ${(totalChars / 1_000_000).toFixed(2)}M`);
  console.log(`Approx tokens: ${(approxTokens / 1_000_000).toFixed(2)}M (target ≥2M)`);
}

main().catch(console.error);
