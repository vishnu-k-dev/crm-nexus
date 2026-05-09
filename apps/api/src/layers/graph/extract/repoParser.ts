const GH = 'https://api.github.com';
const HEADERS = (): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'TechProbe-AI/0.1',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

export interface RepoSnapshot {
  url: string;
  owner: string;
  name: string;
  stars: number;
  primaryLanguage: string;
  languages: Record<string, number>;
  fileCount: number;
  topPaths: string[];
  readme: string;
  packageManifests: Record<string, string>;
  dependencies: string[];
}

function parseUrl(url: string): { owner: string; name: string } {
  const m = url.match(/github\.com[:/]+([^/]+)\/([^/?#]+)/i);
  if (!m) throw new Error(`Not a github URL: ${url}`);
  return { owner: m[1]!, name: m[2]! };
}

async function gh<T>(path: string): Promise<T> {
  // Use native fetch (Node 18+) — more forgiving than undici raw request on Windows (IPv6 fallback issues).
  try {
    const res = await fetch(`${GH}${path}`, { headers: HEADERS() });
    if (!res.ok) throw new Error(`GH ${path} ${res.status}`);
    return await res.json() as T;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[gh] FETCH ERROR', path, (err as Error).message, (err as Error).cause ?? '');
    throw err;
  }
}

// Cache repo snapshots for 5 minutes — both pipelines call fetchRepo, and the bench
// hammers the same repos. Cuts GitHub API load by ~50% and avoids secondary rate limit.
const cache = new Map<string, { ts: number; v: Promise<RepoSnapshot> }>();
const TTL_MS = 5 * 60 * 1000;

export async function fetchRepo(url: string): Promise<RepoSnapshot> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.v;
  const v = fetchRepoUncached(url);
  cache.set(url, { ts: Date.now(), v });
  v.catch(() => cache.delete(url)); // don't cache failures
  return v;
}

async function fetchRepoUncached(url: string): Promise<RepoSnapshot> {
  const { owner, name } = parseUrl(url);
  const [meta, langs] = await Promise.all([
    gh<{ stargazers_count: number; language: string; default_branch: string }>(`/repos/${owner}/${name}`),
    gh<Record<string, number>>(`/repos/${owner}/${name}/languages`),
  ]);
  const tree = await gh<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    `/repos/${owner}/${name}/git/trees/${meta.default_branch}?recursive=1`,
  );
  const files = tree.tree.filter((n) => n.type === 'blob');
  const topPaths = files.slice(0, 200).map((f) => f.path);

  const readme = await gh<{ content: string; encoding: string }>(`/repos/${owner}/${name}/readme`)
    .then((r) => Buffer.from(r.content, r.encoding as BufferEncoding).toString('utf8').slice(0, 4000))
    .catch(() => '');

  const manifestNames = ['package.json', 'requirements.txt', 'Pipfile', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'composer.json', 'Gemfile'];
  const manifests: Record<string, string> = {};
  for (const m of manifestNames) {
    const file = files.find((f) => f.path === m || f.path.endsWith(`/${m}`));
    if (!file) continue;
    try {
      const r = await gh<{ content: string; encoding: string }>(`/repos/${owner}/${name}/contents/${file.path}`);
      manifests[m] = Buffer.from(r.content, r.encoding as BufferEncoding).toString('utf8').slice(0, 4000);
    } catch { /* ignore */ }
  }
  const deps = extractDeps(manifests);

  return {
    url,
    owner,
    name,
    stars: meta.stargazers_count,
    primaryLanguage: meta.language ?? '',
    languages: langs,
    fileCount: files.length,
    topPaths,
    readme,
    packageManifests: manifests,
    dependencies: deps,
  };
}

function extractDeps(m: Record<string, string>): string[] {
  const set = new Set<string>();
  if (m['package.json']) {
    try {
      const j = JSON.parse(m['package.json']) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      Object.keys(j.dependencies ?? {}).forEach((k) => set.add(k));
      Object.keys(j.devDependencies ?? {}).forEach((k) => set.add(k));
    } catch { /* ignore */ }
  }
  if (m['requirements.txt']) {
    m['requirements.txt'].split(/\r?\n/).forEach((l) => {
      const n = l.split(/[=<>~!]/)[0]?.trim();
      if (n) set.add(n);
    });
  }
  if (m['go.mod']) {
    const lines = m['go.mod'].split(/\r?\n/);
    for (const l of lines) {
      const mm = l.trim().match(/^([\w./-]+)\s+v[\d.]/);
      if (mm) set.add(mm[1]!);
    }
  }
  if (m['Cargo.toml']) {
    const inDeps = m['Cargo.toml'].split(/\[dependencies\]/i)[1] ?? '';
    inDeps.split(/\r?\n/).forEach((l) => {
      const mm = l.match(/^([\w-]+)\s*=/);
      if (mm) set.add(mm[1]!);
    });
  }
  return Array.from(set);
}
