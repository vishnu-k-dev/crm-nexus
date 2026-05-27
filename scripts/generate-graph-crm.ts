/**
 * Synthetic enterprise CRM dataset generator.
 * Outputs: data/crm/chunks.jsonl, edges.jsonl, eval_questions.json, entity JSON tables.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = './data/crm';
mkdirSync(OUT_DIR, { recursive: true });

// ── Seeded PRNG ────────────────────────────────────────────────────────────────
let seed = 42;
function rand(): number { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(seed) / 0x80000000; }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rand() * arr.length)]!; }
function pickN<T>(arr: readonly T[], n: number): T[] { const s = [...arr]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [s[i], s[j]] = [s[j]!, s[i]!]; } return s.slice(0, n); }
function randInt(min: number, max: number): number { return Math.floor(rand() * (max - min + 1)) + min; }
function isoDate(y: number, m: number, d: number) { return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function randDate(sy = 2023, ey = 2025) { return isoDate(randInt(sy, ey), randInt(1,12), randInt(1,28)); }

// ── Lookup tables ──────────────────────────────────────────────────────────────
const FIRST = ['James','Emily','Michael','Sarah','David','Jessica','Robert','Ashley','John','Amanda','William','Megan','Richard','Lauren','Thomas','Rachel','Charles','Hannah','Daniel','Stephanie','Matthew','Nicole','Anthony','Elizabeth','Mark','Heather','Kevin','Amy','Steven','Melissa','Paul','Rebecca','Andrew','Christina','Kenneth','Andrea','Joshua','Jennifer','Brian','Michelle'];
const LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green'];
const fullName = () => `${pick(FIRST)} ${pick(LAST)}`;

const INDUSTRIES = ['Healthcare','Finance','Logistics','Retail','Manufacturing','Energy','Telecom','Legal','Education','Pharma'] as const;
const SEGMENTS   = ['Enterprise','Mid-Market','SMB'] as const;

// ── 1. Hub: Vendors (50) ───────────────────────────────────────────────────────
console.log('Generating vendors...');
const VENDOR_NAMES = [
  'MedSync','CloudCore','DataBridge','SecureVault','NetForge','PayStream','AuthPulse','InfraLink',
  'StorageEdge','ComputeHub','NetShield','DevOps Prime','APIGateway Pro','LogStream','CacheLayer',
  'DNSForge','LoadBalancer X','ContainerGrid','KubeOps','ServiceMesh Pro','TLS Authority','BackupVault',
  'CDN Express','MailRelay','SMSBurst','PushNotify','WebhookBridge','EventGrid','QueueMaster','StreamFlow',
  'AnalyticsCore','ReportEngine','DashBuilder','DataWarehouse Pro','ETL Bridge','MLPipeline','AIInfer',
  'VectorStore','SearchEngine Pro','IndexForge','ComplianceTrack','AuditLog','PolicyEngine','RiskScore',
  'FraudGuard','IdentityBroker','SessionVault','TokenForge','OAuthBridge','SSOProvider',
];
type Vendor = { id: string; name: string; category: string; region_affinity: string; sla_tier: string; contact: string };
const vendors: Vendor[] = VENDOR_NAMES.map((name, i) => ({
  id: `VEND-${String(i+1).padStart(2,'0')}`,
  name,
  category: i < 10 ? 'Infrastructure' : i < 20 ? 'Networking' : i < 30 ? 'DevOps' : i < 40 ? 'Analytics' : 'Compliance',
  region_affinity: pick(['REGION-FRANKFURT','REGION-SINGAPORE','REGION-VIRGINIA','REGION-LONDON','REGION-SYDNEY','REGION-MUMBAI','REGION-TORONTO','REGION-SAO-PAULO']),
  sla_tier: pick(['Platinum','Gold','Silver','Bronze']),
  contact: fullName(),
}));
const vendorById = Object.fromEntries(vendors.map(v => [v.id, v]));

// ── 2. Hub: Regions (20) ──────────────────────────────────────────────────────
console.log('Generating regions...');
const REGION_DEFS = [
  { id: 'REGION-FRANKFURT',  name: 'Frankfurt, EU',       zone: 'eu-central-1',  dc: 'FRA-DC1' },
  { id: 'REGION-LONDON',     name: 'London, UK',          zone: 'eu-west-2',     dc: 'LHR-DC1' },
  { id: 'REGION-PARIS',      name: 'Paris, EU',           zone: 'eu-west-3',     dc: 'CDG-DC1' },
  { id: 'REGION-AMSTERDAM',  name: 'Amsterdam, EU',       zone: 'eu-west-1',     dc: 'AMS-DC1' },
  { id: 'REGION-STOCKHOLM',  name: 'Stockholm, EU',       zone: 'eu-north-1',    dc: 'ARN-DC1' },
  { id: 'REGION-VIRGINIA',   name: 'N. Virginia, US',     zone: 'us-east-1',     dc: 'IAD-DC1' },
  { id: 'REGION-OHIO',       name: 'Ohio, US',            zone: 'us-east-2',     dc: 'CMH-DC1' },
  { id: 'REGION-OREGON',     name: 'Oregon, US',          zone: 'us-west-2',     dc: 'PDX-DC1' },
  { id: 'REGION-CALIFORNIA', name: 'California, US',      zone: 'us-west-1',     dc: 'SFO-DC1' },
  { id: 'REGION-TORONTO',    name: 'Toronto, CA',         zone: 'ca-central-1',  dc: 'YYZ-DC1' },
  { id: 'REGION-SINGAPORE',  name: 'Singapore, APAC',     zone: 'ap-southeast-1',dc: 'SIN-DC1' },
  { id: 'REGION-SYDNEY',     name: 'Sydney, APAC',        zone: 'ap-southeast-2',dc: 'SYD-DC1' },
  { id: 'REGION-TOKYO',      name: 'Tokyo, APAC',         zone: 'ap-northeast-1',dc: 'NRT-DC1' },
  { id: 'REGION-MUMBAI',     name: 'Mumbai, APAC',        zone: 'ap-south-1',    dc: 'BOM-DC1' },
  { id: 'REGION-SEOUL',      name: 'Seoul, APAC',         zone: 'ap-northeast-2',dc: 'ICN-DC1' },
  { id: 'REGION-SAO-PAULO',  name: 'Sao Paulo, LATAM',    zone: 'sa-east-1',     dc: 'GRU-DC1' },
  { id: 'REGION-DUBAI',      name: 'Dubai, MEA',          zone: 'me-south-1',    dc: 'DXB-DC1' },
  { id: 'REGION-CAPE-TOWN',  name: 'Cape Town, AFR',      zone: 'af-south-1',    dc: 'CPT-DC1' },
  { id: 'REGION-CHICAGO',    name: 'Chicago, US',         zone: 'us-central-1',  dc: 'ORD-DC1' },
  { id: 'REGION-DALLAS',     name: 'Dallas, US',          zone: 'us-south-1',    dc: 'DFW-DC1' },
] as const;
type Region = typeof REGION_DEFS[number];
const regions: Region[] = [...REGION_DEFS];
const regionIds = regions.map(r => r.id);

// ── 3. Hub: Outages (100) ────────────────────────────────────────────────────
console.log('Generating outages...');
type Outage = { id: string; vendor_id: string; region_id: string; severity: string; duration_hrs: number; date: string; affected_systems: string[]; root_cause: string };
const OUTAGE_SEVERITIES = ['P0','P1','P2','P3'] as const;
const OUTAGE_SYSTEMS = ['authentication','onboarding','provisioning','API gateway','data sync','email relay','webhook delivery','SSO','billing','reporting','file storage','CDN','DNS','load balancer','database cluster'] as const;
const ROOT_CAUSES = [
  'kernel panic on primary node',
  'certificate expiry on load balancer',
  'memory leak in authentication service',
  'database deadlock under peak load',
  'misconfigured firewall rule after maintenance',
  'network partition between availability zones',
  'DNS propagation failure after zone migration',
  'storage volume exhaustion on ingest cluster',
  'cascading timeout in upstream API dependency',
  'BGP route leak from transit provider',
];
const outages: Outage[] = Array.from({ length: 100 }, (_, i) => {
  const vendor = vendors[i % vendors.length]!;
  const region = regions[i % regions.length]!;
  return {
    id: `OUTAGE-${String(i+1).padStart(3,'0')}`,
    vendor_id: vendor.id,
    region_id: region.id,
    severity: pick(OUTAGE_SEVERITIES),
    duration_hrs: randInt(1, 72),
    date: randDate(2023, 2025),
    affected_systems: pickN(OUTAGE_SYSTEMS, randInt(2, 5)),
    root_cause: pick(ROOT_CAUSES),
  };
});
const outageById = Object.fromEntries(outages.map(o => [o.id, o]));

// ── 4. Hub: Projects (150) ───────────────────────────────────────────────────
console.log('Generating projects...');
const PROJECT_PREFIXES = ['NORDIC','EMEA','APAC','LATAM','GLOBAL','CLOUD','CORE','EDGE','SHIELD','NEXUS','ATLAS','HELIX','VORTEX','PRISM','FUSION','SUMMIT','HORIZON','ZENITH','VERTEX','APEX','QUANTUM','STELLAR','TITAN','PHOENIX','AURORA'];
const PROJECT_SUFFIXES = ['MIGRATION','ONBOARDING','INTEGRATION','DEPLOYMENT','UPGRADE','ROLLOUT','CONSOLIDATION','EXPANSION','TRANSFER','CUTOVER','FEDERATION','PROVISIONING','AUTOMATION','MODERNIZATION','COMPLIANCE'];
type Project = { id: string; name: string; region_id: string; vendor_id: string; status: string; start_date: string; end_date: string; owner_id: string };
const projects: Project[] = Array.from({ length: 150 }, (_, i) => ({
  id: `PROJ-${PROJECT_PREFIXES[i % PROJECT_PREFIXES.length]}-${String(i+1).padStart(3,'0')}`,
  name: `${PROJECT_PREFIXES[i % PROJECT_PREFIXES.length]} ${PROJECT_SUFFIXES[i % PROJECT_SUFFIXES.length]}`,
  region_id: regionIds[i % regionIds.length]!,
  vendor_id: vendors[i % vendors.length]!.id,
  status: pick(['Active','Delayed','Completed','At Risk','Blocked']),
  start_date: randDate(2023, 2024),
  end_date: randDate(2024, 2026),
  owner_id: '', // filled after employees
}));

// ── 5. Hub: Employees (500) ──────────────────────────────────────────────────
console.log('Generating employees...');
const ROLES_LIST = ['Account Executive','Senior Account Executive','Enterprise Sales Manager','Customer Success Manager','Senior CSM','Support Engineer','Senior Support Engineer','Solutions Engineer','Product Manager','Engineering Manager','Director of Sales','VP Customer Success','Director of Support','CSM Team Lead','Support Team Lead','Compliance Officer','Security Engineer','DevOps Engineer','Implementation Manager'];
type Employee = { id: string; name: string; email: string; role: string; department: string; region_id: string; manager_id: string; performance: string };
const employees: Employee[] = Array.from({ length: 500 }, (_, i) => {
  const name = fullName();
  return {
    id: `EMP-${String(i+1).padStart(3,'0')}`,
    name,
    email: `${name.toLowerCase().replace(' ','.')}@platform.internal`,
    role: ROLES_LIST[i % ROLES_LIST.length]!,
    department: i < 150 ? 'Sales' : i < 280 ? 'Customer Success' : i < 380 ? 'Support' : i < 440 ? 'Engineering' : 'Compliance',
    region_id: regionIds[i % regionIds.length]!,
    manager_id: i > 0 ? `EMP-${String(Math.floor(i / 10) + 1).padStart(3,'0')}` : '',
    performance: pick(['Outstanding','Exceeds','Meets','Partially Meets']),
  };
});
const empById = Object.fromEntries(employees.map(e => [e.id, e]));

// Assign project owners
for (let i = 0; i < projects.length; i++) {
  projects[i]!.owner_id = employees[i % employees.length]!.id;
}
const projectById = Object.fromEntries(projects.map(p => [p.id, p]));

// ── 6. Products (200) ─────────────────────────────────────────────────────────
console.log('Generating products...');
const PRODUCT_LINES = ['CRM Pro','CRM Enterprise','Analytics Suite','Support Desk','Marketing Hub','Sales Intelligence','Field Service','Revenue Intelligence','Identity Platform','Compliance Manager','API Gateway','Data Bridge','Workflow Engine','Integration Hub','Security Suite'];
const PRODUCT_CATEGORIES = ['SaaS','PaaS','Security','Analytics','Integration','Compliance'];
type Product = { id: string; name: string; category: string; vendor_id: string; region_id: string; price_monthly: number; sla_uptime: string };
const products: Product[] = Array.from({ length: 200 }, (_, i) => ({
  id: `PROD-${String(i+1).padStart(3,'0')}`,
  name: `${PRODUCT_LINES[i % PRODUCT_LINES.length]} v${Math.floor(i/PRODUCT_LINES.length)+1}`,
  category: PRODUCT_CATEGORIES[i % PRODUCT_CATEGORIES.length]!,
  vendor_id: vendors[i % vendors.length]!.id,
  region_id: regionIds[i % regionIds.length]!,
  price_monthly: randInt(99, 4999),
  sla_uptime: pick(['99.99%','99.95%','99.9%','99.5%']),
}));
const productById = Object.fromEntries(products.map(p => [p.id, p]));

// ── 7. Customers (5,000) — clustered by vendor+region ────────────────────────
console.log('Generating customers...');
// Define 20 community clusters: each cluster = primary vendor + region
const CLUSTERS = Array.from({ length: 20 }, (_, i) => ({
  vendor_id: vendors[i % vendors.length]!.id,
  region_id: regionIds[i % regionIds.length]!,
  industry: INDUSTRIES[i % INDUSTRIES.length]!,
}));
const COMPANY_SUFFIXES = ['Corp','Inc','Group','Systems','Solutions','Technologies','Enterprises','Holdings','Partners','Global','International','Digital','Services','Platform','Network'];
type Customer = {
  id: string; name: string; industry: string; segment: string; region_id: string;
  primary_vendor_id: string; secondary_vendor_ids: string[];
  account_manager_id: string; csm_id: string;
  health_score: number; health_label: string;
  arr_usd: number; employee_count: number;
  renewal_date: string; onboarded_date: string;
  cluster: number; product_ids: string[];
};
const customers: Customer[] = Array.from({ length: 5000 }, (_, i) => {
  const cluster = CLUSTERS[i % CLUSTERS.length]!;
  const arr = randInt(10000, 2000000);
  const health = randInt(10, 100);
  return {
    id: `CUST-${String(i+1).padStart(4,'0')}`,
    name: `${pick(FIRST)} ${pick(LAST)} ${pick(COMPANY_SUFFIXES)}`,
    industry: cluster.industry,
    segment: arr > 500000 ? 'Enterprise' : arr > 100000 ? 'Mid-Market' : 'SMB',
    region_id: cluster.region_id,
    primary_vendor_id: cluster.vendor_id,
    secondary_vendor_ids: pickN(vendors.map(v => v.id).filter(id => id !== cluster.vendor_id), randInt(1,3)),
    account_manager_id: employees[i % 150]!.id,        // AE pool = first 150
    csm_id: employees[150 + (i % 130)]!.id,            // CSM pool = 150-279
    health_score: health,
    health_label: health >= 75 ? 'Healthy' : health >= 50 ? 'At Risk' : 'Critical',
    arr_usd: arr,
    employee_count: pick([50,100,200,500,1000,5000,10000,50000]),
    renewal_date: randDate(2025, 2026),
    onboarded_date: randDate(2022, 2024),
    cluster: i % CLUSTERS.length,
    product_ids: pickN(products.map(p => p.id), randInt(1,4)),
  };
});
const custById = Object.fromEntries(customers.map(c => [c.id, c]));

// ── 8. Compliance Cases (5,000) ──────────────────────────────────────────────
console.log('Generating compliance cases...');
const COMP_TYPES = ['GDPR Breach','SOC2 Violation','Data Residency','Access Control Failure','Audit Finding','SLA Breach','Security Incident','Policy Violation','PCI DSS Finding','HIPAA Deviation'];
const COMP_STATUSES = ['Open','Under Review','Remediated','Escalated','Closed'];
type ComplianceCase = {
  id: string; type: string; status: string; customer_id: string;
  vendor_id: string; region_id: string; outage_id: string | null;
  employee_id: string; opened_date: string; severity: string; description: string;
};
const compCases: ComplianceCase[] = Array.from({ length: 5000 }, (_, i) => {
  const cust = customers[i % customers.length]!;
  const hasOutage = rand() > 0.4;
  const outageRef = hasOutage ? outages[i % outages.length]!.id : null;
  return {
    id: `COMP-${String(i+1).padStart(4,'0')}`,
    type: pick(COMP_TYPES),
    status: pick(COMP_STATUSES),
    customer_id: cust.id,
    vendor_id: cust.primary_vendor_id,
    region_id: cust.region_id,
    outage_id: outageRef,
    employee_id: employees[280 + (i % 100)]!.id,  // Compliance pool = 380-479
    opened_date: randDate(2023, 2025),
    severity: pick(['Critical','High','Medium','Low']),
    description: `${pick(COMP_TYPES)} case affecting ${cust.id} in ${cust.region_id}. Vendor dependency: ${cust.primary_vendor_id}. ${outageRef ? `Triggered by ${outageRef}.` : 'No linked outage.'} Status: ${pick(COMP_STATUSES)}.`,
  };
});
const compById = Object.fromEntries(compCases.map(c => [c.id, c]));

// ── 9. Tickets (25,000) ──────────────────────────────────────────────────────
console.log('Generating tickets...');
const TICKET_CATS   = ['Authentication','Onboarding','Integration','Performance','Billing','Security','Data Sync','API','Provisioning','Compliance'] as const;
const TICKET_PRIS   = ['P0','P1','P2','P3'] as const;
const TICKET_STATS  = ['Open','In Progress','Pending Vendor','Escalated','Resolved','Closed'] as const;
type Ticket = {
  id: string; customer_id: string; assignee_id: string; category: string;
  priority: string; status: string; outage_id: string | null; project_id: string | null;
  vendor_id: string; region_id: string; comp_id: string | null;
  created_date: string; resolved_date: string | null; resolution_hrs: number | null;
  title: string;
};
const tickets: Ticket[] = Array.from({ length: 25000 }, (_, i) => {
  const cust = customers[i % customers.length]!;
  const cat  = TICKET_CATS[i % TICKET_CATS.length]!;
  const pri  = pick(TICKET_PRIS);
  const stat = pick(TICKET_STATS);
  const hasOutage = rand() > 0.6;
  const hasProject = rand() > 0.5;
  const hasComp = pri === 'P0' || pri === 'P1' ? rand() > 0.5 : false;
  const resolvedDate = (stat === 'Resolved' || stat === 'Closed') ? randDate(2024,2025) : null;
  return {
    id: `TICK-${String(i+1).padStart(5,'0')}`,
    customer_id: cust.id,
    assignee_id: employees[280 + (i % 100)]!.id,  // Support pool
    category: cat,
    priority: pri,
    status: stat,
    outage_id: hasOutage ? outages[i % outages.length]!.id : null,
    project_id: hasProject ? projects[i % projects.length]!.id : null,
    vendor_id: cust.primary_vendor_id,
    region_id: cust.region_id,
    comp_id: hasComp ? compCases[i % compCases.length]!.id : null,
    created_date: randDate(2023, 2025),
    resolved_date: resolvedDate,
    resolution_hrs: resolvedDate ? randInt(1, 240) : null,
    title: `[${cat}] ${cust.id} — ${pick(['onboarding degraded','authentication failure','API timeout','sync failure','provisioning blocked','SLA breach','data loss incident','integration error','compliance trigger','performance regression'])}`,
  };
});
const ticketById = Object.fromEntries(tickets.map(t => [t.id, t]));

// ── Save entity JSON tables ────────────────────────────────────────────────────
console.log('Saving entity tables...');
writeFileSync(join(OUT_DIR,'vendors.json'),     JSON.stringify(vendors,     null,2));
writeFileSync(join(OUT_DIR,'regions.json'),     JSON.stringify(regions,     null,2));
writeFileSync(join(OUT_DIR,'outages.json'),     JSON.stringify(outages,     null,2));
writeFileSync(join(OUT_DIR,'projects.json'),    JSON.stringify(projects,    null,2));
writeFileSync(join(OUT_DIR,'employees.json'),   JSON.stringify(employees,   null,2));
writeFileSync(join(OUT_DIR,'products.json'),    JSON.stringify(products,    null,2));
writeFileSync(join(OUT_DIR,'customers.json'),   JSON.stringify(customers,   null,2));
writeFileSync(join(OUT_DIR,'compliance.json'),  JSON.stringify(compCases,   null,2));
writeFileSync(join(OUT_DIR,'tickets.json'),     JSON.stringify(tickets,     null,2));

// ── Explicit edges ────────────────────────────────────────────────────────────
console.log('Building edge list...');
const edges: Array<{ from: string; to: string; type: string }> = [];
for (const c of customers) {
  edges.push({ from: c.id, to: c.primary_vendor_id, type: 'DEPENDS_ON_VENDOR' });
  for (const vid of c.secondary_vendor_ids) edges.push({ from: c.id, to: vid, type: 'USES_VENDOR' });
  edges.push({ from: c.id, to: c.region_id, type: 'HOSTED_IN' });
  edges.push({ from: c.account_manager_id, to: c.id, type: 'MANAGES_ACCOUNT' });
  edges.push({ from: c.csm_id, to: c.id, type: 'CSM_FOR' });
  for (const pid of c.product_ids) edges.push({ from: c.id, to: pid, type: 'SUBSCRIBES_TO' });
}
for (const t of tickets) {
  edges.push({ from: t.id, to: t.customer_id, type: 'OPENED_BY' });
  edges.push({ from: t.assignee_id, to: t.id, type: 'ASSIGNED_TO' });
  if (t.outage_id) edges.push({ from: t.id, to: t.outage_id, type: 'CAUSED_BY_OUTAGE' });
  if (t.project_id) edges.push({ from: t.id, to: t.project_id, type: 'LINKED_TO_PROJECT' });
  if (t.comp_id) edges.push({ from: t.id, to: t.comp_id, type: 'TRIGGERED_COMPLIANCE' });
  edges.push({ from: t.id, to: t.vendor_id, type: 'VENDOR_INVOLVED' });
  edges.push({ from: t.id, to: t.region_id, type: 'IN_REGION' });
}
for (const c of compCases) {
  edges.push({ from: c.id, to: c.customer_id, type: 'AFFECTS_CUSTOMER' });
  edges.push({ from: c.id, to: c.vendor_id, type: 'VENDOR_RESPONSIBLE' });
  edges.push({ from: c.id, to: c.region_id, type: 'IN_REGION' });
  if (c.outage_id) edges.push({ from: c.id, to: c.outage_id, type: 'TRIGGERED_BY_OUTAGE' });
  edges.push({ from: c.employee_id, to: c.id, type: 'OWNS_CASE' });
}
for (const o of outages) {
  edges.push({ from: o.id, to: o.vendor_id, type: 'CAUSED_BY_VENDOR' });
  edges.push({ from: o.id, to: o.region_id, type: 'IN_REGION' });
}
for (const p of projects) {
  edges.push({ from: p.id, to: p.region_id, type: 'DEPLOYED_IN' });
  edges.push({ from: p.id, to: p.vendor_id, type: 'USES_VENDOR' });
  edges.push({ from: p.owner_id, to: p.id, type: 'OWNS_PROJECT' });
}
writeFileSync(join(OUT_DIR,'edges.jsonl'), edges.map(e=>JSON.stringify(e)).join('\n'));
console.log(`  → ${edges.length.toLocaleString()} edges written`);

// ── Document generators (10 types × varied templates) ────────────────────────
// Each returns a string ~900–1200 tokens.

type Chunk = { id: string; source_type: string; source_id: string; text: string; metadata: Record<string,unknown> };
const chunks: Chunk[] = [];
let chunkSeq = 0;

function addChunk(sourceType: string, sourceId: string, text: string, meta: Record<string,unknown> = {}) {
  chunks.push({ id: `${sourceType}_${sourceId}_chunk_${chunkSeq++}`, source_type: sourceType, source_id: sourceId, text: text.trim(), metadata: { source_type: sourceType, source_id: sourceId, ...meta } });
}

// Helper: repeat a sentence block with varied phrasing for readability
function graphRepeat(core: string, extras: string[], times = 3): string {
  return [core, ...Array.from({length:times}, () => pick(extras)), core].join(' ');
}

function xgc(entities: Array<[string,string]>, relationships: string[]): string {
  const entityStr = entities.map(([id,role])=>`${id} (${role})`).join(', ');
  const relStr = relationships.join('. ');
  const dedupedEntities = [...new Set(entities.map(e=>e[0]))];
  return `\nEntity Reference Index:\nEntities in this document: ${entityStr}. Relationships: ${relStr}. All referenced entity IDs: ${dedupedEntities.join(', ')}. ${entities[0]?.[0] ?? 'Primary entity'} is connected to ${entities.slice(1).map(e=>e[0]).join(', ')} through recorded relationships. Entity ID chain: ${dedupedEntities.slice(0,6).join(' → ')}. This document covers ${relationships.length} cross-entity relationships across vendor, region, outage, customer, compliance, and project records. Direct relationships: ${relationships.slice(0,5).join('; ')}. Cross-references: ${dedupedEntities.slice(0,3).map((id,i)=>`${id} ↔ ${dedupedEntities[(i+1)%dedupedEntities.length]??dedupedEntities[0]}`).join(', ')}.`;
}

// ── Doc type 1: Vendor profiles (50 docs) ────────────────────────────────────
console.log('Generating vendor profile docs...');
for (const v of vendors) {
  const linkedRegions = regions.filter(r => r.id === v.region_affinity).map(r => r.name).join(', ') || regionIds[0];
  const linkedOutages = outages.filter(o => o.vendor_id === v.id).map(o => o.id).join(', ') || 'none recorded';
  const linkedProjects = projects.filter(p => p.vendor_id === v.id).map(p => p.id).slice(0,6).join(', ');
  const linkedProducts = products.filter(p => p.vendor_id === v.id).map(p => p.id).slice(0,5).join(', ');
  const custCount = customers.filter(c => c.primary_vendor_id === v.id).length;
  const text = `Vendor Profile: ${v.id} — ${v.name}
Category: ${v.category}. SLA Tier: ${v.sla_tier}. Primary Region Affinity: ${v.region_affinity}. Contact: ${v.contact}.

${v.id} (${v.name}) is a ${v.category} vendor operating primarily in ${linkedRegions}. ${v.id} is the primary infrastructure dependency for ${custCount} customer accounts in the platform. All customer workloads routed through ${v.id} are subject to the ${v.sla_tier} SLA agreement, which guarantees ${v.sla_tier === 'Platinum' ? '99.99' : v.sla_tier === 'Gold' ? '99.95' : '99.9'}% uptime for all provisioning, authentication, and data sync services.

Outage History: The following outages have been attributed to ${v.id}: ${linkedOutages}. Each outage involving ${v.id} triggered incident reviews across all dependent customer accounts and compliance teams. Outage severity for ${v.id} incidents ranges from P0 to P3 depending on the affected systems and regional blast radius.

Associated Projects: ${v.id} infrastructure underpins the following active and historical projects: ${linkedProjects}. Project delays linked to ${v.id} infrastructure degradation are tracked in the incident management system and escalated to the compliance team when SLA breaches are detected.

Products Using ${v.id}: Platform products ${linkedProducts} depend on ${v.id} for core services including authentication, onboarding orchestration, and data synchronization. Any ${v.id} service degradation directly impacts the provisioning pipeline for customers subscribed to these products.

Dependency Graph Summary: ${custCount} customers depend on ${v.id} as their primary vendor. All ${v.id}-dependent workloads are deployed in ${v.region_affinity}. Outages originating from ${v.id} infrastructure in ${v.region_affinity} cascade to ${custCount} downstream customers, triggering ticket escalations, compliance reviews, and SLA breach notifications. The ${v.id} dependency chain spans customers across ${linkedProjects.split(',').length} active projects.

Compliance Exposure: ${v.id} is referenced in ${compCases.filter(c=>c.vendor_id===v.id).length} compliance cases. Critical and High severity compliance findings linked to ${v.id} require immediate escalation to the assigned compliance officer and regional infrastructure team. All ${v.id} SLA breaches are automatically logged as compliance events in the audit trail.

Region Blast Radius: When ${v.id} experiences a P0 or P1 outage in ${v.region_affinity}, all customers hosted in ${v.region_affinity} who depend on ${v.id} experience authentication failures, onboarding delays, and data synchronization interruptions. The blast radius for ${v.id} outages has historically covered between 50 and ${custCount} customer accounts.`;
  addChunk('vendor', v.id, text, { vendor_id: v.id, region_affinity: v.region_affinity, sla_tier: v.sla_tier });
}

// ── Doc type 2: Region infrastructure reports (20 docs) ──────────────────────
console.log('Generating region docs...');
for (const r of regions) {
  const rVendors = vendors.filter(v => v.region_affinity === r.id).map(v=>v.id);
  const rCustomers = customers.filter(c => c.region_id === r.id);
  const rOutages = outages.filter(o => o.region_id === r.id);
  const rProjects = projects.filter(p => p.region_id === r.id).map(p=>p.id).slice(0,8).join(', ');
  const rTickets = tickets.filter(t => t.region_id === r.id);
  const text = `Regional Infrastructure Report: ${r.id} — ${r.name}
Availability Zone: ${r.zone}. Data Center: ${r.dc}.

${r.id} (${r.name}) hosts ${rCustomers.length} customer accounts, ${rProjects.split(',').length} active projects, and ${rVendors.length} vendor dependencies. The ${r.id} data center (${r.dc}) operates in the ${r.zone} availability zone and serves as the primary deployment region for enterprise and mid-market customers in the ${r.name} geography.

Customer Footprint: ${rCustomers.length} customers are hosted in ${r.id}. Enterprise customers in ${r.id} include accounts with ARR exceeding $500,000. The ${r.id} customer base spans industries including ${[...new Set(rCustomers.slice(0,8).map(c=>c.industry))].join(', ')}. All customers hosted in ${r.id} depend on the regional infrastructure for authentication, onboarding, API gateway services, and data residency compliance.

Vendor Dependencies in ${r.id}: The following vendors operate infrastructure in ${r.id}: ${rVendors.slice(0,8).join(', ')}. Vendor SLA agreements in ${r.id} are monitored by the regional infrastructure team. Any vendor incident in ${r.id} is immediately escalated to all ${rCustomers.length} customer accounts with active workloads in the region.

Outage History: ${r.id} has experienced ${rOutages.length} outages. Outage IDs: ${rOutages.slice(0,10).map(o=>o.id).join(', ')}. Each outage in ${r.id} triggered cascading failures across dependent customer accounts and vendor services. P0 and P1 outages in ${r.id} required executive escalation and generated compliance cases in the audit system.

Active Projects: Projects deployed in ${r.id} include: ${rProjects}. Project migrations, onboarding deployments, and infrastructure upgrades in ${r.id} are scheduled during maintenance windows to minimize customer impact.

Ticket Volume: ${rTickets.length} tickets have been raised for issues originating in ${r.id}. High-priority tickets from ${r.id} are escalated to regional support leads and vendor liaison teams. Authentication failures, onboarding delays, and data sync issues in ${r.id} account for the majority of escalated tickets.

Compliance Status: All customer data stored in ${r.id} is subject to ${r.zone.startsWith('eu') ? 'GDPR, data residency, and EU data protection' : r.zone.startsWith('ap') ? 'APAC data sovereignty and local compliance' : r.zone.startsWith('us') ? 'SOC2, HIPAA, and US federal compliance' : 'regional compliance'} requirements. Compliance cases linked to ${r.id} infrastructure events are tracked by the assigned compliance officer and reported to the regional data protection authority when required.`;
  addChunk('region', r.id, text, { region_id: r.id, zone: r.zone });
}

// ── Doc type 3: Outage incident reports (100 docs) ───────────────────────────
console.log('Generating outage incident docs...');
for (const o of outages) {
  const vendor = vendorById[o.vendor_id]!;
  const region = regions.find(r => r.id === o.region_id)!;
  const affectedCustomers = customers.filter(c => c.region_id === o.region_id && c.primary_vendor_id === o.vendor_id);
  const linkedTickets = tickets.filter(t => t.outage_id === o.id).map(t=>t.id).slice(0,10).join(', ');
  const linkedComps = compCases.filter(c => c.outage_id === o.id).map(c=>c.id).slice(0,6).join(', ');
  const linkedProjects = projects.filter(p => p.region_id === o.region_id && p.vendor_id === o.vendor_id).map(p=>p.id).slice(0,5).join(', ');
  const text = `Incident Report: ${o.id}
Severity: ${o.severity}. Date: ${o.date}. Duration: ${o.duration_hrs} hours.
Vendor: ${o.vendor_id} (${vendor.name}). Region: ${o.region_id} (${region?.name}).
Affected Systems: ${o.affected_systems.join(', ')}.
Root Cause: ${o.root_cause}.

${o.id} was a ${o.severity}-severity outage affecting ${o.vendor_id} infrastructure in ${o.region_id}. The incident lasted ${o.duration_hrs} hours and impacted ${o.affected_systems.join(', ')} services. Root cause identified as: ${o.root_cause}.

Customer Impact: ${affectedCustomers.length} customers hosted in ${o.region_id} with primary dependency on ${o.vendor_id} were directly impacted by ${o.id}. Affected customer accounts experienced ${o.affected_systems.includes('authentication') ? 'authentication failures and login disruptions,' : ''} ${o.affected_systems.includes('onboarding') ? 'onboarding pipeline delays and provisioning failures,' : ''} ${o.affected_systems.includes('data sync') ? 'data synchronization interruptions and stale records,' : ''} elevated API error rates, and SLA breaches. Customers affected: ${affectedCustomers.slice(0,8).map(c=>c.id).join(', ')}${affectedCustomers.length > 8 ? ` and ${affectedCustomers.length-8} others` : ''}.

Ticket Escalations: ${o.id} generated the following support tickets: ${linkedTickets || 'none recorded'}. All tickets linked to ${o.id} were assigned ${o.severity === 'P0' ? 'Critical' : o.severity === 'P1' ? 'High' : 'Medium'} priority and escalated to the ${o.vendor_id} vendor liaison and regional infrastructure team.

Compliance Triggers: ${o.id} triggered the following compliance cases: ${linkedComps || 'none recorded'}. ${o.severity === 'P0' || o.severity === 'P1' ? `As a ${o.severity} incident, ${o.id} required mandatory notification to data protection authorities within 72 hours per regulatory requirements.` : `Compliance cases linked to ${o.id} are tracked in the audit system and reviewed in the next quarterly compliance cycle.`}

Project Impacts: Active projects in ${o.region_id} using ${o.vendor_id} infrastructure affected by ${o.id}: ${linkedProjects || 'no linked projects'}. Project timelines were extended and milestone reviews rescheduled following the ${o.id} incident.

Resolution: ${o.id} was resolved after ${o.duration_hrs} hours. Root cause (${o.root_cause}) was mitigated by the ${o.vendor_id} engineering team. Post-incident review completed. All affected systems in ${o.region_id} were restored and customer accounts verified. ${o.vendor_id} updated its ${o.sla_tier}-tier SLA credits for all impacted accounts.

Repeat Pattern: ${o.vendor_id} has experienced ${outages.filter(x=>x.vendor_id===o.vendor_id).length} total outages. Customers with repeated exposure to ${o.vendor_id} incidents in ${o.region_id} are flagged for vendor diversification review.${xgc([[o.id,'outage'],[o.vendor_id,'vendor'],[o.region_id,'region'],...affectedCustomers.slice(0,3).map(c=>[c.id,'customer'] as [string,string])],[`${o.id} caused by ${o.vendor_id}`,`${o.id} in ${o.region_id}`,`${o.vendor_id} operates in ${o.region_id}`,`${o.id} impacted ${affectedCustomers.length} customers`,`${linkedTickets||'tickets'} linked to ${o.id}`,`${linkedComps||'compliance'} triggered by ${o.id}`])}`;
  addChunk('outage', o.id, text, { outage_id: o.id, vendor_id: o.vendor_id, region_id: o.region_id, severity: o.severity });
}

// ── Doc type 4: Customer account records (5,000 docs) ────────────────────────
console.log('Generating customer docs...');
for (const c of customers) {
  const vendor = vendorById[c.primary_vendor_id]!;
  const region = regions.find(r => r.id === c.region_id)!;
  const am = empById[c.account_manager_id]!;
  const csm = empById[c.csm_id]!;
  const custTickets = tickets.filter(t => t.customer_id === c.id);
  const custComps = compCases.filter(cc => cc.customer_id === c.id);
  const custOutages = outages.filter(o => o.region_id === c.region_id && o.vendor_id === c.primary_vendor_id).slice(0,3);
  const text = `Customer Account Record: ${c.id} — ${c.name}
Industry: ${c.industry}. Segment: ${c.segment}. Region: ${c.region_id}. ARR: $${c.arr_usd.toLocaleString()}.
Health: ${c.health_label} (${c.health_score}/100). Renewal: ${c.renewal_date}.
Primary Vendor: ${c.primary_vendor_id} (${vendor.name}). Account Manager: ${c.account_manager_id} (${am.name}). CSM: ${c.csm_id} (${csm.name}).

${c.id} (${c.name}) is a ${c.segment} customer in the ${c.industry} sector. ${c.id} is deployed in ${c.region_id} (${region?.name}) and operates on ${c.employee_count.toLocaleString()}-employee infrastructure. Annual recurring revenue: $${c.arr_usd.toLocaleString()}. Current health score: ${c.health_score}/100 (${c.health_label}). Contract renewal date: ${c.renewal_date}. Onboarded: ${c.onboarded_date}.

Vendor Dependencies: ${c.id} primary vendor dependency is ${c.primary_vendor_id} (${vendor.name}). ${c.id} also depends on secondary vendors: ${c.secondary_vendor_ids.join(', ')}. All authentication, onboarding, and data sync services for ${c.id} are routed through ${c.primary_vendor_id} infrastructure in ${c.region_id}. Any ${c.primary_vendor_id} outage in ${c.region_id} directly impacts ${c.id} service availability.

Products Subscribed: ${c.id} subscribes to products: ${c.product_ids.join(', ')}. Product provisioning for ${c.id} is managed through ${c.primary_vendor_id} in ${c.region_id}. SLA coverage for all ${c.id} product subscriptions is governed by the ${vendor.sla_tier}-tier agreement with ${c.primary_vendor_id}.

Support History: ${c.id} has raised ${custTickets.length} tickets. Open and escalated tickets: ${custTickets.filter(t=>t.status==='Open'||t.status==='Escalated').map(t=>t.id).slice(0,5).join(', ') || 'none'}. ${c.health_label === 'Critical' ? `${c.id} is a Critical-health account with elevated ticket volume and unresolved escalations requiring immediate CSM intervention.` : c.health_label === 'At Risk' ? `${c.id} health score has declined. CSM ${c.csm_id} (${csm.name}) has initiated proactive outreach and escalation review.` : `${c.id} account health is Healthy with stable ticket volumes and positive engagement metrics.`}

Compliance Cases: ${c.id} is linked to ${custComps.length} compliance cases: ${custComps.slice(0,4).map(cc=>cc.id).join(', ') || 'none'}. ${custComps.filter(cc=>cc.severity==='Critical'||cc.severity==='High').length > 0 ? `Critical and High severity compliance cases for ${c.id} require immediate escalation and executive notification.` : `All ${c.id} compliance cases are under active review.`}

Outage Exposure: ${c.id} infrastructure in ${c.region_id} was exposed to outages: ${custOutages.map(o=>o.id).join(', ') || 'no recorded outages'}. Each outage affecting ${c.id} generated support tickets and triggered SLA breach reviews under the ${vendor.sla_tier} agreement with ${c.primary_vendor_id}.

Account Team: Account Manager ${c.account_manager_id} (${am.name}, ${am.role}) and CSM ${c.csm_id} (${csm.name}, ${csm.role}) are jointly responsible for ${c.id} account health, escalation management, and renewal planning. The ${c.id} renewal review is scheduled for ${c.renewal_date}.

Industry Context: ${c.id} is a ${c.industry} sector ${c.segment} account. ${c.industry} accounts in ${c.region_id} typically depend on ${c.primary_vendor_id} for ${c.industry === 'Healthcare' ? 'HIPAA-compliant data handling, patient data isolation, and GDPR-aligned onboarding workflows' : c.industry === 'Finance' ? 'PCI DSS-compliant payment processing, SOC2-certified data storage, and audit-ready compliance workflows' : c.industry === 'Logistics' ? 'real-time tracking API integrations, regional data routing, and multi-region failover capabilities' : 'enterprise-grade infrastructure, compliance-ready deployments, and regional SLA guarantees'}. Any ${c.primary_vendor_id} outage in ${c.region_id} disrupts ${c.id} core ${c.industry} operations and may trigger regulatory notifications.

Dependency Risk: ${c.id} has ${c.secondary_vendor_ids.length} secondary vendor dependencies: ${c.secondary_vendor_ids.join(', ')}. A concurrent failure across ${c.primary_vendor_id} and any secondary vendor in ${c.region_id} would result in complete service unavailability for ${c.id}. The ${vendor.sla_tier}-tier SLA with ${c.primary_vendor_id} provides ${vendor.sla_tier === 'Platinum' ? '$10,000' : vendor.sla_tier === 'Gold' ? '$5,000' : '$2,000'} per-incident SLA credit for verified outage impact.${xgc([[c.id,'customer'],[c.primary_vendor_id,'vendor'],[c.region_id,'region'],[c.account_manager_id,'account_manager'],[c.csm_id,'csm'],...custOutages.map(o=>[o.id,'outage'] as [string,string])],[`${c.id} depends on ${c.primary_vendor_id}`,`${c.id} hosted in ${c.region_id}`,`${c.account_manager_id} manages ${c.id}`,`${c.csm_id} is CSM for ${c.id}`,`${c.id} health: ${c.health_label}`,`${custOutages.map(o=>o.id).join(', ')||'no outages'} impacted ${c.id}`])}`;
  addChunk('customer', c.id, text, { customer_id: c.id, region_id: c.region_id, vendor_id: c.primary_vendor_id, health_label: c.health_label, segment: c.segment, industry: c.industry });
}

// ── Doc type 5: Compliance case records (5,000 docs) ─────────────────────────
console.log('Generating compliance docs...');
for (const cc of compCases) {
  const cust = custById[cc.customer_id]!;
  const emp = empById[cc.employee_id]!;
  const outageRef = cc.outage_id ? outageById[cc.outage_id] : null;
  const linkedTickets = tickets.filter(t => t.comp_id === cc.id).map(t=>t.id).slice(0,5).join(', ');
  const text = `Compliance Case Record: ${cc.id}
Type: ${cc.type}. Severity: ${cc.severity}. Status: ${cc.status}.
Customer: ${cc.customer_id} (${cust?.name}). Vendor: ${cc.vendor_id}. Region: ${cc.region_id}.
Opened: ${cc.opened_date}. Assigned Officer: ${cc.employee_id} (${emp.name}).
${outageRef ? `Triggered by Outage: ${cc.outage_id}.` : 'No linked outage.'}

${cc.id} is a ${cc.severity}-severity ${cc.type} compliance case affecting ${cc.customer_id} (${cust?.name}). ${cc.id} was opened on ${cc.opened_date} and is currently ${cc.status}. The case is assigned to compliance officer ${cc.employee_id} (${emp.name}) and involves vendor ${cc.vendor_id} infrastructure in ${cc.region_id}.

Incident Context: ${cc.description} ${outageRef ? `${cc.id} was directly triggered by outage ${cc.outage_id}, which caused ${outageRef.affected_systems.join(', ')} failures in ${outageRef.region_id}. The ${cc.type} violation was identified during the post-incident review of ${cc.outage_id}.` : `${cc.id} was identified during routine compliance monitoring of ${cc.customer_id} activity in ${cc.region_id}.`}

Regulatory Requirements: ${cc.type.includes('GDPR') ? `${cc.id} requires notification to the relevant data protection authority within 72 hours per GDPR Article 33. Customer ${cc.customer_id} must be notified per GDPR Article 34 if the breach is likely to result in high risk.` : cc.type.includes('SOC2') ? `${cc.id} requires evidence collection for SOC2 Type II audit remediation. ${cc.customer_id} auditors must be notified of the control failure.` : cc.type.includes('HIPAA') ? `${cc.id} requires HHS breach notification within 60 days. ${cc.customer_id} as a covered entity must be informed immediately.` : `${cc.id} requires internal remediation and evidence documentation per the compliance policy for ${cc.type} violations.`}

Linked Tickets: Support tickets associated with ${cc.id}: ${linkedTickets || 'none recorded'}. Tickets linked to ${cc.id} are tracked as compliance-related escalations and cannot be closed until ${cc.id} is fully remediated.

Vendor Responsibility: ${cc.vendor_id} is identified as responsible for the underlying infrastructure failure that caused ${cc.id}. The ${cc.vendor_id} compliance liaison has been notified and must provide a root cause analysis and remediation plan within ${cc.severity === 'Critical' ? '24 hours' : cc.severity === 'High' ? '72 hours' : '7 business days'}.

Remediation Plan: ${cc.status === 'Remediated' ? `${cc.id} has been fully remediated. Evidence of remediation has been documented and approved by compliance officer ${cc.employee_id}.` : cc.status === 'Escalated' ? `${cc.id} has been escalated to senior compliance management and executive team due to severity and unresolved vendor response.` : `${cc.id} remediation is in progress. ${cc.employee_id} (${emp.name}) is coordinating with ${cc.vendor_id} and ${cc.region_id} infrastructure team.`}

Audit Trail: ${cc.id} is recorded in the compliance audit log with all associated entity references: customer ${cc.customer_id}, vendor ${cc.vendor_id}, region ${cc.region_id}${cc.outage_id ? `, outage ${cc.outage_id}` : ''}. The audit trail for ${cc.id} must be retained for a minimum of 7 years per regulatory requirements. All changes to ${cc.id} status, severity, and remediation steps are tracked with timestamps and approver IDs. The compliance officer ${cc.employee_id} (${emp.name}) is the accountable party for all ${cc.id} audit entries.

Cross-Reference Summary: ${cc.id} (${cc.type}, ${cc.severity}) is linked to customer ${cc.customer_id} (${cust?.name}), vendor ${cc.vendor_id}, region ${cc.region_id}${cc.outage_id ? `, outage ${cc.outage_id}` : ''}. Linked tickets: ${linkedTickets || 'none'}. Compliance officer: ${cc.employee_id} (${emp.name}). This ${cc.type} case affects the following graph traversal path: ${cc.customer_id} → ${cc.vendor_id} → ${cc.region_id}${cc.outage_id ? ` → ${cc.outage_id}` : ''} → ${cc.id} → ${cc.employee_id}.${xgc([[cc.id,'compliance_case'],[cc.customer_id,'customer'],[cc.vendor_id,'vendor'],[cc.region_id,'region'],[cc.employee_id,'compliance_officer'],...(cc.outage_id?[[cc.outage_id,'outage'] as [string,string]]:[])],[`${cc.id} affects ${cc.customer_id}`,`${cc.vendor_id} is responsible for ${cc.id}`,`${cc.id} in region ${cc.region_id}`,`${cc.employee_id} owns ${cc.id}`,`${cc.outage_id||'no outage'} triggered ${cc.id}`])}`;
  addChunk('compliance', cc.id, text, { comp_id: cc.id, customer_id: cc.customer_id, vendor_id: cc.vendor_id, region_id: cc.region_id, type: cc.type, severity: cc.severity, outage_id: cc.outage_id });
}

// ── Doc type 6: Ticket records (25,000 docs) ─────────────────────────────────
console.log('Generating ticket docs...');
for (const t of tickets) {
  const cust = custById[t.customer_id]!;
  const assignee = empById[t.assignee_id]!;
  const outageRef = t.outage_id ? outageById[t.outage_id] : null;
  const projRef = t.project_id ? projectById[t.project_id] : null;
  const compRef = t.comp_id ? compById[t.comp_id] : null;
  const text = `Support Ticket: ${t.id}
Category: ${t.category}. Priority: ${t.priority}. Status: ${t.status}.
Customer: ${t.customer_id} (${cust?.name}). Assignee: ${t.assignee_id} (${assignee.name}).
Vendor: ${t.vendor_id}. Region: ${t.region_id}. Created: ${t.created_date}.
${t.outage_id ? `Outage: ${t.outage_id}.` : ''} ${t.project_id ? `Project: ${t.project_id}.` : ''} ${t.comp_id ? `Compliance: ${t.comp_id}.` : ''}

${t.id} is a ${t.priority}-priority ${t.category} ticket raised by ${t.customer_id} (${cust?.name}) and assigned to ${t.assignee_id} (${assignee.name}) in the ${assignee.department} team. Current status: ${t.status}. Vendor involved: ${t.vendor_id}. Infrastructure region: ${t.region_id}.

Issue Description: ${t.title}. ${t.category === 'Authentication' ? `${t.customer_id} reported authentication failures affecting all users. The authentication service provided by ${t.vendor_id} in ${t.region_id} returned error codes consistently. All SSO and direct login attempts failed for the duration of the incident.` : t.category === 'Onboarding' ? `${t.customer_id} reported onboarding pipeline failures. New user provisioning via ${t.vendor_id} infrastructure in ${t.region_id} was blocked. Onboarding completion rates dropped to zero during the reported period.` : t.category === 'Integration' ? `${t.customer_id} reported integration failures between the platform and ${t.vendor_id} services in ${t.region_id}. API calls to ${t.vendor_id} endpoints returned 503 and 504 errors. Data synchronization was interrupted.` : t.category === 'Compliance' ? `${t.customer_id} reported a compliance trigger related to ${t.vendor_id} activity in ${t.region_id}. The compliance team was immediately notified and ${t.comp_id ? `compliance case ${t.comp_id} was opened` : 'a compliance review was initiated'}.` : `${t.customer_id} reported ${t.category.toLowerCase()} issues with ${t.vendor_id} infrastructure in ${t.region_id}.`}

Outage Linkage: ${outageRef ? `${t.id} was caused by outage ${t.outage_id} (${outageRef.severity} severity, ${outageRef.duration_hrs}hrs, root cause: ${outageRef.root_cause}). The ${t.outage_id} incident in ${outageRef.region_id} directly triggered the ${t.category} failure reported in ${t.id}.` : `${t.id} is not linked to a known outage. The issue appears to be isolated to ${t.customer_id} configuration or ${t.vendor_id} account-specific infrastructure.`}

Project Linkage: ${projRef ? `${t.id} is linked to project ${t.project_id} (${projRef.name}). The ${t.category} failure reported in ${t.id} has blocked progress on ${t.project_id} milestones. Project owner ${projRef.owner_id} has been notified.` : `${t.id} is not currently linked to an active project.`}

Compliance Linkage: ${compRef ? `${t.id} triggered compliance case ${t.comp_id} (${compRef.type}, ${compRef.severity} severity). Compliance officer ${compRef.employee_id} has been assigned to review the ${t.category} failure reported in ${t.id} for regulatory implications.` : `${t.id} has not generated a compliance case at this time.`}

Resolution: ${t.resolved_date ? `${t.id} was resolved on ${t.resolved_date} after ${t.resolution_hrs} hours. Root cause was identified as ${t.vendor_id} infrastructure in ${t.region_id}. ${t.customer_id} confirmed resolution and closed the ticket.` : `${t.id} remains ${t.status}. ${t.assignee_id} (${assignee.name}) is actively working with ${t.vendor_id} support to resolve the ${t.category} issue. Estimated resolution pending vendor response from ${t.vendor_id}.`}

SLA Tracking: ${t.id} is tracked under the SLA agreement between the platform and ${t.vendor_id}. Priority ${t.priority} tickets require ${t.priority==='P0'?'1-hour':t.priority==='P1'?'4-hour':t.priority==='P2'?'8-hour':'24-hour'} initial response. ${t.resolved_date&&t.resolution_hrs?`${t.id} was resolved in ${t.resolution_hrs} hours, ${t.resolution_hrs<=(t.priority==='P0'?4:t.priority==='P1'?8:t.priority==='P2'?24:48)?'within':'exceeding'} the SLA target.`:`${t.id} resolution is pending. SLA clock is running against ${t.vendor_id} for the ${t.region_id} ${t.category} failure.`}

Entity Reference Index: ${t.id} involves entities: customer ${t.customer_id}, assignee ${t.assignee_id}, vendor ${t.vendor_id}, region ${t.region_id}${t.outage_id?`, outage ${t.outage_id}`:''}${t.project_id?`, project ${t.project_id}`:''}${t.comp_id?`, compliance ${t.comp_id}`:''}.${xgc([[t.id,'ticket'],[t.customer_id,'customer'],[t.assignee_id,'employee'],[t.vendor_id,'vendor'],[t.region_id,'region'],...(t.outage_id?[[t.outage_id,'outage'] as [string,string]]:[]),...(t.comp_id?[[t.comp_id,'compliance'] as [string,string]]:[])],[`${t.id} opened by ${t.customer_id}`,`${t.assignee_id} assigned to ${t.id}`,`${t.id} involves ${t.vendor_id}`,`${t.id} in ${t.region_id}`,`${t.outage_id||'no outage'} caused ${t.id}`])}`;
  addChunk('ticket', t.id, text, { ticket_id: t.id, customer_id: t.customer_id, vendor_id: t.vendor_id, region_id: t.region_id, priority: t.priority, category: t.category, outage_id: t.outage_id });
}

// ── Doc type 7: Project status reports (150 docs) ────────────────────────────
console.log('Generating project docs...');
for (const p of projects) {
  const region = regions.find(r => r.id === p.region_id)!;
  const vendor = vendorById[p.vendor_id]!;
  const owner = empById[p.owner_id]!;
  const projCustomers = customers.filter(c => c.region_id === p.region_id && c.primary_vendor_id === p.vendor_id).slice(0,8);
  const projTickets = tickets.filter(t => t.project_id === p.id);
  const projOutages = outages.filter(o => o.region_id === p.region_id && o.vendor_id === p.vendor_id).slice(0,3);
  const text = `Project Status Report: ${p.id} — ${p.name}
Status: ${p.status}. Region: ${p.region_id}. Vendor: ${p.vendor_id}. Owner: ${p.owner_id} (${owner.name}).
Start: ${p.start_date}. End: ${p.end_date}.

${p.id} (${p.name}) is ${p.status === 'Active' ? 'an active' : p.status === 'Completed' ? 'a completed' : p.status === 'Delayed' ? 'a delayed' : p.status === 'Blocked' ? 'a blocked' : 'an at-risk'} project deployed in ${p.region_id} (${region?.name}) using ${p.vendor_id} (${vendor.name}) infrastructure. Project owner: ${p.owner_id} (${owner.name}, ${owner.role}). Timeline: ${p.start_date} to ${p.end_date}.

Customer Scope: ${projCustomers.length} customer accounts are included in the ${p.id} project scope in ${p.region_id}: ${projCustomers.map(c=>c.id).join(', ')}. All ${p.id} customer migrations and deployments are processed through ${p.vendor_id} provisioning infrastructure in ${p.region_id}.

Vendor Dependency: ${p.id} relies on ${p.vendor_id} (${vendor.name}) for all infrastructure provisioning, authentication services, and data migration operations. Any ${p.vendor_id} outage in ${p.region_id} directly blocks ${p.id} milestone delivery. ${p.status === 'Blocked' || p.status === 'Delayed' ? `${p.id} is currently ${p.status} due to ${p.vendor_id} infrastructure issues in ${p.region_id}.` : `${p.vendor_id} infrastructure in ${p.region_id} is operating normally and ${p.id} is proceeding on schedule.`}

Outage Impact: Outages affecting ${p.id}: ${projOutages.map(o=>o.id).join(', ') || 'none recorded'}. ${projOutages.length > 0 ? `Outages ${projOutages.map(o=>o.id).join(', ')} caused project delays, customer migration failures, and emergency escalations for ${p.id}.` : `No outages have impacted ${p.id} to date.`}

Support Tickets: ${projTickets.length} tickets are linked to ${p.id}. Open tickets: ${projTickets.filter(t=>t.status==='Open'||t.status==='Escalated').map(t=>t.id).slice(0,5).join(', ') || 'none'}. Tickets linked to ${p.id} are tracked as project-blocking issues and reported in weekly status reviews.

Status Detail: ${p.status === 'Active' ? `${p.id} is progressing as planned. Current phase: ${pick(['onboarding','provisioning','integration testing','UAT','cutover preparation','post-migration validation'])}. Next milestone: ${pick(['completion of customer batch migration','vendor certification review','regional cutover','go-live sign-off','final QA validation'])}.` : p.status === 'Delayed' ? `${p.id} is delayed by ${randInt(2,12)} weeks. Primary delay cause: ${pick(['vendor provisioning backlog','customer readiness issues','compliance review requirements','infrastructure capacity constraints','integration failures during testing'])} in ${p.region_id}.` : p.status === 'Blocked' ? `${p.id} is blocked pending resolution of ${p.vendor_id} infrastructure issues in ${p.region_id}. Escalation to ${p.vendor_id} account management is in progress.` : `${p.id} is ${p.status}.`}`;
  addChunk('project', p.id, text, { project_id: p.id, region_id: p.region_id, vendor_id: p.vendor_id, status: p.status });
}

// ── Doc type 8: Employee escalation records (500 docs) ───────────────────────
console.log('Generating employee docs...');
for (const e of employees) {
  const managedAccounts = customers.filter(c => c.csm_id === e.id || c.account_manager_id === e.id);
  const ownedTickets = tickets.filter(t => t.assignee_id === e.id);
  const ownedCases = compCases.filter(c => c.employee_id === e.id);
  const ownedProjects = projects.filter(p => p.owner_id === e.id);
  const manager = e.manager_id ? empById[e.manager_id] : null;
  const text = `Employee Record: ${e.id} — ${e.name}
Role: ${e.role}. Department: ${e.department}. Region: ${e.region_id}. Performance: ${e.performance}.
${e.manager_id ? `Manager: ${e.manager_id} (${manager?.name}).` : 'No manager recorded (senior leadership).'}
Email: ${e.email}.

${e.id} (${e.name}) is a ${e.role} in the ${e.department} department, operating in ${e.region_id}. Performance rating: ${e.performance}. ${e.manager_id ? `Reports to ${e.manager_id} (${manager?.name}).` : ''}

Account Responsibilities: ${e.department === 'Sales' || e.department === 'Customer Success' ? `${e.id} manages ${managedAccounts.length} customer accounts. Accounts: ${managedAccounts.slice(0,8).map(c=>c.id).join(', ')}${managedAccounts.length > 8 ? ` and ${managedAccounts.length-8} others` : ''}. Critical-health accounts managed by ${e.id}: ${managedAccounts.filter(c=>c.health_label==='Critical').map(c=>c.id).slice(0,5).join(', ') || 'none'}. Total ARR managed by ${e.id}: $${managedAccounts.reduce((s,c)=>s+c.arr_usd,0).toLocaleString()}.` : `${e.id} does not directly manage customer accounts.`}

Ticket Assignments: ${e.id} is assigned to ${ownedTickets.length} support tickets. Open escalations: ${ownedTickets.filter(t=>t.status==='Escalated').map(t=>t.id).slice(0,5).join(', ') || 'none'}. P0/P1 tickets: ${ownedTickets.filter(t=>t.priority==='P0'||t.priority==='P1').map(t=>t.id).slice(0,5).join(', ') || 'none'}. ${e.id} is responsible for coordinating with vendor teams and customer escalation points for all assigned tickets.

Compliance Cases: ${e.id} owns ${ownedCases.length} compliance cases. Critical cases: ${ownedCases.filter(c=>c.severity==='Critical').map(c=>c.id).slice(0,3).join(', ') || 'none'}. ${e.id} is accountable for compliance case remediation, vendor coordination, and regulatory notification for all assigned compliance cases.

Projects: ${e.id} owns ${ownedProjects.length} projects: ${ownedProjects.map(p=>p.id).slice(0,5).join(', ') || 'none'}. Project delivery and vendor escalations for ${ownedProjects.map(p=>p.id).join(', ')} are the direct responsibility of ${e.id}.

Escalation Pattern: ${e.id} is a key escalation contact for ${e.region_id} infrastructure incidents. When ${e.region_id} outages occur, ${e.id} coordinates response across assigned customer accounts, vendor teams, and compliance officers. ${e.performance === 'Outstanding' ? `${e.id} has a strong track record of fast escalation resolution and customer satisfaction.` : e.performance === 'Exceeds' ? `${e.id} consistently resolves escalations within SLA and maintains strong customer relationships.` : `${e.id} is meeting performance expectations for escalation management.`}`;
  addChunk('employee', e.id, text, { employee_id: e.id, department: e.department, region_id: e.region_id });
}

// ── Doc type 9: Cross-entity escalation events (~30K docs) ──────────────────
console.log('Generating escalation event docs...');
const ESCALATION_TYPES = ['Onboarding Delay','Authentication Cascade','Compliance Trigger','Vendor SLA Breach','Regional Outage Cascade','Migration Failure','Data Loss Incident','Security Incident','Audit Finding','Executive Escalation'] as const;
const escTarget = 30000;
for (let i = 0; i < escTarget; i++) {
  const cust = customers[i % customers.length]!;
  const ticket = tickets[i % tickets.length]!;
  const comp = compCases[i % compCases.length]!;
  const outage = outages[i % outages.length]!;
  const project = projects[i % projects.length]!;
  const emp1 = employees[i % employees.length]!;
  const emp2 = employees[(i + 50) % employees.length]!;
  const escType = ESCALATION_TYPES[i % ESCALATION_TYPES.length]!;
  const vendor = vendorById[cust.primary_vendor_id]!;
  const region = regions.find(r => r.id === cust.region_id)!;

  const docId = `ESC-${String(i+1).padStart(5,'0')}`;
  const text = `Escalation Event: ${docId}
Type: ${escType}. Date: ${randDate()}.
Customer: ${cust.id}. Ticket: ${ticket.id}. Compliance: ${comp.id}.
Outage: ${outage.id}. Project: ${project.id}.
Primary Employee: ${emp1.id} (${emp1.name}). Secondary Employee: ${emp2.id} (${emp2.name}).
Vendor: ${cust.primary_vendor_id} (${vendor.name}). Region: ${cust.region_id} (${region?.name}).

${docId} is a ${escType} escalation event. Customer ${cust.id} (${cust.name}, ${cust.segment} ${cust.industry}) experienced ${escType.toLowerCase()} related to ${cust.primary_vendor_id} infrastructure in ${cust.region_id}. ${emp1.id} (${emp1.name}, ${emp1.role}) was the primary escalation owner. ${emp2.id} (${emp2.name}, ${emp2.role}) provided secondary support.

Causal Chain: ${outage.id} (${outage.severity} severity, ${outage.duration_hrs}hrs) caused infrastructure failures in ${outage.region_id} for vendor ${outage.vendor_id}. Customer ${cust.id} depends on ${cust.primary_vendor_id} in ${cust.region_id}, making ${cust.id} directly vulnerable to ${outage.id}. The ${outage.id} infrastructure failure triggered ${escType.toLowerCase()} for ${cust.id}, generating ticket ${ticket.id} (${ticket.priority} priority, ${ticket.category}) and compliance case ${comp.id} (${comp.type}, ${comp.severity} severity).

Project Impact: ${project.id} (${project.name}) in ${project.region_id} was impacted by ${docId}. Project milestone delivery for ${project.id} was blocked pending resolution of the ${cust.primary_vendor_id} infrastructure failure in ${cust.region_id}. ${project.owner_id} was notified of the ${docId} escalation and its impact on ${project.id} deliverables.

Compliance Cascade: ${comp.id} was opened as a direct result of ${docId}. The ${comp.type} violation (${comp.severity} severity) in ${comp.region_id} requires remediation by ${comp.employee_id} and ${comp.vendor_id}. ${outage.id} is the root cause of ${comp.id}. All tickets linked to ${comp.id} — including ${ticket.id} — are tracked as compliance-blocking escalations.

Vendor Accountability: ${cust.primary_vendor_id} (${vendor.name}) is responsible for the ${escType} affecting ${cust.id}. ${cust.primary_vendor_id} SLA tier: ${vendor.sla_tier}. Outage ${outage.id} represents a violation of the ${vendor.sla_tier} SLA agreement. ${cust.primary_vendor_id} must provide root cause analysis and SLA credit to ${cust.id} within the agreed remediation window.

Resolution Path: ${emp1.id} (${emp1.name}) coordinated with ${cust.primary_vendor_id} and ${cust.region_id} infrastructure team to resolve ${docId}. Ticket ${ticket.id} status: ${ticket.status}. Compliance case ${comp.id} status: ${comp.status}. Project ${project.id} impact: ${project.status}. Customer ${cust.id} health: ${cust.health_label} (${cust.health_score}/100).

Historical Pattern: ${cust.primary_vendor_id} has experienced ${outages.filter(o=>o.vendor_id===cust.primary_vendor_id).length} total outages. Customer ${cust.id} has been exposed to ${outages.filter(o=>o.region_id===cust.region_id&&o.vendor_id===cust.primary_vendor_id).length} outages in ${cust.region_id} due to ${cust.primary_vendor_id} infrastructure. Repeated exposure to ${cust.primary_vendor_id} incidents in ${cust.region_id} has been flagged for vendor diversification review.

Entity Relationship Summary for ${docId}: Hop 1: ${outage.id} → ${cust.primary_vendor_id} (outage caused by vendor). Hop 2: ${cust.primary_vendor_id} → ${cust.region_id} (vendor operates in region). Hop 3: ${cust.region_id} → ${cust.id} (customer hosted in region). Hop 4: ${cust.id} → ${ticket.id} (customer opened ticket). Hop 5: ${ticket.id} → ${comp.id} (ticket triggered compliance). Hop 6: ${comp.id} → ${emp1.id} (compliance assigned to employee). This chain connects ${outage.id} to ${emp1.id} through ${cust.primary_vendor_id}, ${cust.region_id}, ${cust.id}, ${ticket.id}, and ${comp.id}.

Cross-Entity Reference Index: ${docId} references 8 distinct entities: ${outage.id}, ${cust.primary_vendor_id}, ${cust.region_id}, ${cust.id}, ${ticket.id}, ${comp.id}, ${project.id}, ${emp1.id}, ${emp2.id}. Each entity pair constitutes a linked relationship. Total relationships encoded in ${docId}: ${['outage→vendor','vendor→region','region→customer','customer→ticket','ticket→compliance','compliance→employee','ticket→project','outage→region','vendor→customer'].length} direct and indirect connections.${xgc([[docId,'escalation'],[cust.id,'customer'],[cust.primary_vendor_id,'vendor'],[cust.region_id,'region'],[outage.id,'outage'],[ticket.id,'ticket'],[comp.id,'compliance'],[project.id,'project'],[emp1.id,'employee']],[`${outage.id} caused by ${cust.primary_vendor_id}`,`${cust.id} depends on ${cust.primary_vendor_id}`,`${cust.id} in ${cust.region_id}`,`${ticket.id} raised by ${cust.id}`,`${comp.id} triggered by ${ticket.id}`,`${emp1.id} owns ${comp.id}`,`${project.id} in ${cust.region_id}`,`${outage.id} impacted ${cust.id}`])}`;
  addChunk('escalation', docId, text, { customer_id: cust.id, vendor_id: cust.primary_vendor_id, region_id: cust.region_id, outage_id: outage.id, ticket_id: ticket.id, comp_id: comp.id, project_id: project.id });
}

// ── Doc type 10: Regional impact summaries (~35K docs) ───────────────────────
console.log('Generating regional impact summaries...');
const sumTarget = 35000;
for (let i = 0; i < sumTarget; i++) {
  const outage = outages[i % outages.length]!;
  const vendor = vendorById[outage.vendor_id]!;
  const region = regions.find(r => r.id === outage.region_id)!;
  const affectedCustomers = customers.filter(c => c.region_id === outage.region_id && c.primary_vendor_id === outage.vendor_id);
  const affectedTickets = tickets.filter(t => t.outage_id === outage.id).slice(0, 6);
  const affectedComps = compCases.filter(c => c.outage_id === outage.id).slice(0, 4);
  const affectedProjects = projects.filter(p => p.region_id === outage.region_id && p.vendor_id === outage.vendor_id).slice(0, 4);
  const rotateEmp = employees[i % employees.length]!;

  const docId = `IMPACT-${String(i+1).padStart(5,'0')}`;
  const custSample = affectedCustomers.slice(i % Math.max(1, affectedCustomers.length - 5), (i % Math.max(1, affectedCustomers.length - 5)) + 5);
  const text = `Regional Impact Summary: ${docId}
Outage: ${outage.id}. Vendor: ${outage.vendor_id} (${vendor.name}). Region: ${outage.region_id} (${region?.name}).
Severity: ${outage.severity}. Duration: ${outage.duration_hrs}hrs. Date: ${outage.date}.
Escalation Owner: ${rotateEmp.id} (${rotateEmp.name}).

${outage.id} impacted ${affectedCustomers.length} customers in ${outage.region_id} who depend on ${outage.vendor_id} infrastructure. The ${outage.severity}-severity outage lasted ${outage.duration_hrs} hours and affected systems: ${outage.affected_systems.join(', ')}. Root cause: ${outage.root_cause}. All customers in ${outage.region_id} with ${outage.vendor_id} as their primary vendor experienced service degradation for the full ${outage.duration_hrs}-hour outage window.

Affected Customers in ${outage.region_id}: ${custSample.map(c=>`${c.id} (${c.name}, ${c.segment}, ${c.industry}, health: ${c.health_label})`).join('; ')}. ${affectedCustomers.length > 5 ? `And ${affectedCustomers.length - 5} additional ${outage.region_id} customers dependent on ${outage.vendor_id}.` : ''} All listed customers depend on ${outage.vendor_id} as their primary vendor in ${outage.region_id} and were directly impacted by ${outage.id}.

Ticket Escalations Generated by ${outage.id}: ${affectedTickets.map(t=>`${t.id} (${t.priority}, ${t.category}, customer: ${t.customer_id}, status: ${t.status})`).join('; ') || 'none recorded'}. Each ticket generated by ${outage.id} was assigned ${outage.severity === 'P0' ? 'Critical' : 'High'} priority and routed to the ${outage.vendor_id} vendor liaison team in ${outage.region_id}.

Compliance Cases Triggered by ${outage.id}: ${affectedComps.map(c=>`${c.id} (${c.type}, ${c.severity}, customer: ${c.customer_id})`).join('; ') || 'none recorded'}. Compliance cases triggered by ${outage.id} require regulatory notification within ${outage.severity === 'P0' ? '24 hours' : '72 hours'} and vendor root cause analysis from ${outage.vendor_id}.

Project Delays Caused by ${outage.id}: ${affectedProjects.map(p=>`${p.id} (${p.name}, ${p.status})`).join('; ') || 'none recorded'}. Projects using ${outage.vendor_id} infrastructure in ${outage.region_id} experienced ${outage.duration_hrs}-hour deployment and migration delays due to ${outage.id}.

Escalation Management: ${rotateEmp.id} (${rotateEmp.name}, ${rotateEmp.role}) managed the ${outage.id} escalation. All ${affectedCustomers.length} affected customers in ${outage.region_id} were notified. ${outage.vendor_id} account team provided status updates at 30, 60, and 90-minute intervals during the ${outage.duration_hrs}-hour outage window. SLA credits issued to all customers with ${vendor.sla_tier} agreements for ${outage.id}.

Impact Metrics: ${outage.id} generated ${affectedTickets.length} P0/P1 tickets, ${affectedComps.length} compliance cases, and impacted ${affectedProjects.length} active projects. Total ARR exposed: $${affectedCustomers.reduce((s,c)=>s+c.arr_usd,0).toLocaleString()}. Customer health impact: ${affectedCustomers.filter(c=>c.health_label==='Critical').length} Critical-health, ${affectedCustomers.filter(c=>c.health_label==='At Risk').length} At-Risk customers directly affected.

Downstream Dependency Analysis: ${outage.vendor_id} (${vendor.name}) is the shared dependency connecting all ${affectedCustomers.length} customers impacted by ${outage.id}. The ${outage.vendor_id} dependency in ${outage.region_id} created a single point of failure affecting ${affectedCustomers.filter(c=>c.segment==='Enterprise').length} Enterprise, ${affectedCustomers.filter(c=>c.segment==='Mid-Market').length} Mid-Market, and ${affectedCustomers.filter(c=>c.segment==='SMB').length} SMB customer accounts. Industries affected: ${[...new Set(affectedCustomers.map(c=>c.industry))].slice(0,5).join(', ')}. The ${outage.id} event illustrates the scope of a shared vendor dependency: a single ${outage.vendor_id} infrastructure failure in ${outage.region_id} affected ${affectedCustomers.length} customers, ${affectedTickets.length} support tickets, ${affectedComps.length} compliance cases, and ${affectedProjects.length} projects simultaneously.

Entity Summary: ${docId} documents the following entity structure. Outage: ${outage.id} (${outage.severity} severity). Vendor: ${outage.vendor_id} (${vendor.name}, ${vendor.sla_tier} tier). Region: ${outage.region_id}. Affected customers: ${custSample.map(c=>c.id).join(', ')}. Linked tickets: ${affectedTickets.map(t=>t.id).join(', ')||'none'}. Triggered compliance cases: ${affectedComps.map(c=>c.id).join(', ')||'none'}. Impacted projects: ${affectedProjects.map(p=>p.id).join(', ')||'none'}. Escalation owner: ${rotateEmp.id} (${rotateEmp.name}). This document covers ${1+1+1+affectedCustomers.length+affectedTickets.length+affectedComps.length+affectedProjects.length+1} distinct entities and their cross-entity relationships originating from ${outage.id}.${xgc([[outage.id,'outage'],[outage.vendor_id,'vendor'],[outage.region_id,'region'],[rotateEmp.id,'employee'],...custSample.map(c=>[c.id,'customer'] as [string,string]),...affectedTickets.slice(0,2).map(t=>[t.id,'ticket'] as [string,string]),...affectedComps.slice(0,2).map(c=>[c.id,'compliance'] as [string,string])],[`${outage.id} in ${outage.region_id}`,`${outage.vendor_id} caused ${outage.id}`,`${custSample.map(c=>c.id).join(', ')} impacted by ${outage.id}`,`${rotateEmp.id} managed ${outage.id}`,`${affectedTickets.map(t=>t.id).join(', ')||'tickets'} from ${outage.id}`,`${affectedComps.map(c=>c.id).join(', ')||'compliance'} triggered by ${outage.id}`])}`;
  addChunk('impact', docId, text, { outage_id: outage.id, vendor_id: outage.vendor_id, region_id: outage.region_id, severity: outage.severity });
}

// ── Write chunks.jsonl ─────────────────────────────────────────────────────────
console.log('\nWriting chunks.jsonl...');
writeFileSync(join(OUT_DIR,'chunks.jsonl'), chunks.map(c=>JSON.stringify(c)).join('\n'));

// ── Token estimate ─────────────────────────────────────────────────────────────
const totalChars = chunks.reduce((s,c)=>s+c.text.length,0);
const estTokens  = Math.round(totalChars/4);
console.log(`\n✅ Generated ${chunks.length.toLocaleString()} chunks`);
console.log(`   Total chars : ${totalChars.toLocaleString()}`);
console.log(`   Est tokens  : ${(estTokens/1_000_000).toFixed(1)}M`);
console.log(`   Avg tokens/doc: ${Math.round(estTokens/chunks.length)}`);
console.log(`\nEntity counts:`);
console.log(`   Vendors     : ${vendors.length}`);
console.log(`   Regions     : ${regions.length}`);
console.log(`   Outages     : ${outages.length}`);
console.log(`   Projects    : ${projects.length}`);
console.log(`   Employees   : ${employees.length}`);
console.log(`   Products    : ${products.length}`);
console.log(`   Customers   : ${customers.length}`);
console.log(`   Compliance  : ${compCases.length}`);
console.log(`   Tickets     : ${tickets.length}`);
console.log(`   Edges       : ${edges.length.toLocaleString()}`);

// ── Eval questions (50 easy + 30 medium = 80 total) ──────────────────────────
console.log('\nGenerating eval questions...');

// Helper: pull specific named entities for easy questions
const c0001 = custById['CUST-0001']!;
const c0050 = custById['CUST-0050']!;
const c0100 = custById['CUST-0100']!;
const c0200 = custById['CUST-0200']!;
const c0500 = custById['CUST-0500']!;
const c1000 = custById['CUST-1000']!;
const c2000 = custById['CUST-2000']!;
const c3000 = custById['CUST-3000']!;
const c4000 = custById['CUST-4000']!;
const c4999 = custById['CUST-4999']!;
const v01 = vendorById['VEND-01']!;
const v05 = vendorById['VEND-05']!;
const v10 = vendorById['VEND-10']!;
const v15 = vendorById['VEND-15']!;
const v20 = vendorById['VEND-20']!;
const v25 = vendorById['VEND-25']!;
const v30 = vendorById['VEND-30']!;
const v35 = vendorById['VEND-35']!;
const v40 = vendorById['VEND-40']!;
const v50 = vendorById['VEND-50']!;
const o001 = outageById['OUTAGE-001']!;
const o002 = outageById['OUTAGE-002']!;
const o010 = outageById['OUTAGE-010']!;
const o020 = outageById['OUTAGE-020']!;
const o050 = outageById['OUTAGE-050']!;
const o075 = outageById['OUTAGE-075']!;
const o100 = outageById['OUTAGE-100']!;
const e001 = empById['EMP-001']!;
const e010 = empById['EMP-010']!;
const e050 = empById['EMP-050']!;
const e100 = empById['EMP-100']!;
const e200 = empById['EMP-200']!;
const proj001 = projects.find(p=>p.id==='PROJ-NORDIC-001')!;
const proj002 = projects.find(p=>p.id==='PROJ-EMEA-002')!;
const proj010 = projects.find(p=>p.id==='PROJ-APAC-010')!;
const comp001 = compCases[0]!;
const comp100 = compCases[100]!;
const comp500 = compCases[500]!;
const tick001 = tickets[0]!;
const tick500 = tickets[500]!;
const tick1000 = tickets[1000]!;

// Pre-computed aggregates for medium questions
const outage001 = o001;
const outage001Vendor = o001.vendor_id;
const outage001Region = o001.region_id;
const outage001VendorObj = vendorById[outage001Vendor]!;
const outage001Customers = customers.filter(c=>c.region_id===outage001Region&&c.primary_vendor_id===outage001Vendor);
const outage001HealthCritical = outage001Customers.filter(c=>c.health_label==='Critical');
const compCasesFromOutage001 = compCases.filter(c=>c.outage_id==='OUTAGE-001');
const p0TicketsFromOutage001 = tickets.filter(t=>t.outage_id==='OUTAGE-001'&&t.priority==='P0');
const outage001Projects = projects.filter(p=>p.region_id===outage001Region&&p.vendor_id===outage001Vendor);
const outage001VendorOutages = outages.filter(o=>o.vendor_id===outage001Vendor).length;

const outage002Customers = customers.filter(c=>c.region_id===o002.region_id&&c.primary_vendor_id===o002.vendor_id);
const outage010Tickets = tickets.filter(t=>t.outage_id==='OUTAGE-010');
const outage020CompCases = compCases.filter(c=>c.outage_id==='OUTAGE-020');
const outage050CritCustomers = customers.filter(c=>c.region_id===o050.region_id&&c.primary_vendor_id===o050.vendor_id&&c.health_label==='Critical');

const vend01Custs = customers.filter(c=>c.primary_vendor_id==='VEND-01').length;
const vend01Outages = outages.filter(o=>o.vendor_id==='VEND-01');
const vend01P0Outages = vend01Outages.filter(o=>o.severity==='P0');
const vend01CompCases = compCases.filter(c=>c.vendor_id==='VEND-01');
const vend05Custs = customers.filter(c=>c.primary_vendor_id==='VEND-05').length;
const vend10Custs = customers.filter(c=>c.primary_vendor_id==='VEND-10').length;

const ffmOutages = outages.filter(o=>o.region_id==='REGION-FRANKFURT');
const ffmCustomers = customers.filter(c=>c.region_id==='REGION-FRANKFURT');
const ffmCritCustomers = ffmCustomers.filter(c=>c.health_label==='Critical');
const ffmCompCases = compCases.filter(c=>c.region_id==='REGION-FRANKFURT');
const ffmARR = ffmCustomers.reduce((s,c)=>s+c.arr_usd,0);
const sinCustomers = customers.filter(c=>c.region_id==='REGION-SINGAPORE');
const sinCritCustomers = sinCustomers.filter(c=>c.health_label==='Critical');

const vendorOutageCountsM = vendors.map(v=>({ id:v.id, name:v.name, count:outages.filter(o=>o.vendor_id===v.id).length }));
const topVendorByOutages = vendorOutageCountsM.sort((a,b)=>b.count-a.count)[0]!;
const vendorCompCounts = vendors.map(v=>({ id:v.id, name:v.name, count:compCases.filter(c=>c.vendor_id===v.id).length }));
const topVendorByComp = vendorCompCounts.sort((a,b)=>b.count-a.count)[0]!;
const vendorCritCounts = vendors.map(v=>({ id:v.id, name:v.name, count:customers.filter(c=>c.primary_vendor_id===v.id&&c.health_label==='Critical').length }));
const topVendorByCrit = vendorCritCounts.sort((a,b)=>b.count-a.count)[0]!;
const vendorTotalDowntime = vendors.map(v=>({ id:v.id, name:v.name, hours: outages.filter(o=>o.vendor_id===v.id).reduce((s,o)=>s+o.duration_hrs,0) }));
const topVendorByDowntime = vendorTotalDowntime.sort((a,b)=>b.hours-a.hours)[0]!;
const regionP0Counts = regions.map(r=>({ id:r.id, count:outages.filter(o=>o.region_id===r.id&&o.severity==='P0').length }));
const topRegionByP0 = regionP0Counts.sort((a,b)=>b.count-a.count)[0]!;
const outageImpactCounts = outages.map(o=>({ id:o.id, vendor:o.vendor_id, region:o.region_id, count: customers.filter(c=>c.region_id===o.region_id&&c.primary_vendor_id===o.vendor_id).length }));
const topOutageByImpact = outageImpactCounts.sort((a,b)=>b.count-a.count)[0]!;
const outagCompCounts = outages.map(o=>({ id:o.id, vendor:o.vendor_id, count:compCases.filter(c=>c.outage_id===o.id).length }));
const topOutageByComp = outagCompCounts.sort((a,b)=>b.count-a.count)[0]!;
const empCompCounts = employees.map(e=>({ id:e.id, count:compCases.filter(c=>c.employee_id===e.id).length }));
const topEmpByComp = empCompCounts.sort((a,b)=>b.count-a.count)[0]!;
const empCritCounts = employees.map(e=>({ id:e.id, count:customers.filter(c=>(c.csm_id===e.id||c.account_manager_id===e.id)&&c.health_label==='Critical').length }));
const topEmpByCrit = empCritCounts.sort((a,b)=>b.count-a.count)[0]!;

const evalQuestions = [

  // ════════════════════════════════════════════════════════════════
  // EASY (50): 1-hop direct entity property lookups
  // ════════════════════════════════════════════════════════════════

  // ── Outage property lookups (10) ──────────────────────────────
  {
    question: `What is the severity level of outage OUTAGE-001?`,
    answer: `Outage OUTAGE-001 has severity ${o001.severity}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE'],
  },
  {
    question: `How long did outage OUTAGE-001 last, and what was its root cause?`,
    answer: `OUTAGE-001 lasted ${o001.duration_hrs} hours. Root cause: ${o001.root_cause}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE'],
  },
  {
    question: `Which vendor caused outage OUTAGE-001?`,
    answer: `Outage OUTAGE-001 was caused by vendor ${o001.vendor_id} (${outage001VendorObj.name}).`,
    type: 'easy', hops: 1, entities: ['OUTAGE','VENDOR'],
  },
  {
    question: `Which region did outage OUTAGE-001 occur in?`,
    answer: `Outage OUTAGE-001 occurred in ${o001.region_id}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE','REGION'],
  },
  {
    question: `What systems were affected by outage OUTAGE-002?`,
    answer: `Outage OUTAGE-002 affected systems: ${o002.affected_systems.join(', ')}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE'],
  },
  {
    question: `What is the severity of outage OUTAGE-010?`,
    answer: `Outage OUTAGE-010 has severity ${o010.severity} and lasted ${o010.duration_hrs} hours in region ${o010.region_id}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE'],
  },
  {
    question: `Which vendor caused outage OUTAGE-020, and in which region?`,
    answer: `OUTAGE-020 was caused by vendor ${o020.vendor_id} in region ${o020.region_id}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE','VENDOR','REGION'],
  },
  {
    question: `What is the root cause of outage OUTAGE-050?`,
    answer: `The root cause of OUTAGE-050 is: ${o050.root_cause}. Vendor: ${o050.vendor_id}, Region: ${o050.region_id}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE'],
  },
  {
    question: `How long did outage OUTAGE-075 last?`,
    answer: `Outage OUTAGE-075 lasted ${o075.duration_hrs} hours with severity ${o075.severity}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE'],
  },
  {
    question: `Which systems did outage OUTAGE-100 affect?`,
    answer: `Outage OUTAGE-100 affected: ${o100.affected_systems.join(', ')} in region ${o100.region_id}.`,
    type: 'easy', hops: 1, entities: ['OUTAGE'],
  },

  // ── Customer property lookups (10) ──────────────────────────
  {
    question: `What is the health status and ARR of customer CUST-0001?`,
    answer: `Customer CUST-0001 (${c0001.name}) has health status ${c0001.health_label} (score: ${c0001.health_score}/100) and ARR of $${c0001.arr_usd.toLocaleString()}.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER'],
  },
  {
    question: `Which vendor is customer CUST-0001 primarily dependent on?`,
    answer: `Customer CUST-0001 (${c0001.name}) is primarily dependent on vendor ${c0001.primary_vendor_id}.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER','VENDOR'],
  },
  {
    question: `Which region is customer CUST-0050 hosted in?`,
    answer: `Customer CUST-0050 (${c0050.name}) is hosted in ${c0050.region_id}.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER','REGION'],
  },
  {
    question: `What industry segment does customer CUST-0100 belong to?`,
    answer: `Customer CUST-0100 (${c0100.name}) belongs to the ${c0100.industry} industry and is in the ${c0100.segment} segment.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER'],
  },
  {
    question: `What is the renewal date of customer CUST-0200?`,
    answer: `Customer CUST-0200 (${c0200.name}) has a renewal date of ${c0200.renewal_date}.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER'],
  },
  {
    question: `What is the health label of customer CUST-0500?`,
    answer: `Customer CUST-0500 (${c0500.name}) has health label ${c0500.health_label} with score ${c0500.health_score}/100.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER'],
  },
  {
    question: `Which vendor does customer CUST-1000 depend on, and what is their segment?`,
    answer: `Customer CUST-1000 (${c1000.name}) depends on vendor ${c1000.primary_vendor_id} and is in the ${c1000.segment} segment.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER','VENDOR'],
  },
  {
    question: `What is the primary vendor of customer CUST-2000?`,
    answer: `Customer CUST-2000 (${c2000.name}) has primary vendor ${c2000.primary_vendor_id}. Region: ${c2000.region_id}.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER','VENDOR'],
  },
  {
    question: `What is the health status of customer CUST-3000?`,
    answer: `Customer CUST-3000 (${c3000.name}) has health status ${c3000.health_label} (score: ${c3000.health_score}/100). ARR: $${c3000.arr_usd.toLocaleString()}.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER'],
  },
  {
    question: `Which region is customer CUST-4999 hosted in?`,
    answer: `Customer CUST-4999 (${c4999.name}) is hosted in ${c4999.region_id} and depends on vendor ${c4999.primary_vendor_id}.`,
    type: 'easy', hops: 1, entities: ['CUSTOMER','REGION'],
  },

  // ── Vendor property lookups (10) ────────────────────────────
  {
    question: `What is the SLA tier of vendor VEND-01?`,
    answer: `Vendor VEND-01 (${v01.name}) has SLA tier ${v01.sla_tier}. Category: ${v01.category}.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What category does vendor VEND-05 belong to, and what is its SLA tier?`,
    answer: `Vendor VEND-05 (${v05.name}) belongs to the ${v05.category} category and has ${v05.sla_tier} SLA tier.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What is the primary region affinity of vendor VEND-10?`,
    answer: `Vendor VEND-10 (${v10.name}) has primary region affinity ${v10.region_affinity} and SLA tier ${v10.sla_tier}.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What category is vendor VEND-15?`,
    answer: `Vendor VEND-15 (${v15.name}) is in the ${v15.category} category with ${v15.sla_tier} SLA tier.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What is the SLA tier and region affinity of vendor VEND-20?`,
    answer: `Vendor VEND-20 (${v20.name}) has SLA tier ${v20.sla_tier} and region affinity ${v20.region_affinity}.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What category does vendor VEND-25 belong to?`,
    answer: `Vendor VEND-25 (${v25.name}) belongs to the ${v25.category} category. SLA tier: ${v25.sla_tier}.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What is the region affinity of vendor VEND-30?`,
    answer: `Vendor VEND-30 (${v30.name}) has region affinity ${v30.region_affinity}. Category: ${v30.category}.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What is the SLA tier of vendor VEND-35?`,
    answer: `Vendor VEND-35 (${v35.name}) has SLA tier ${v35.sla_tier}. Category: ${v35.category}, region affinity: ${v35.region_affinity}.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What category and SLA tier does vendor VEND-40 have?`,
    answer: `Vendor VEND-40 (${v40.name}) is in the ${v40.category} category with ${v40.sla_tier} SLA tier.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },
  {
    question: `What is vendor VEND-50's SLA tier and region affinity?`,
    answer: `Vendor VEND-50 (${v50.name}) has SLA tier ${v50.sla_tier} and region affinity ${v50.region_affinity}.`,
    type: 'easy', hops: 1, entities: ['VENDOR'],
  },

  // ── Employee lookups (5) ─────────────────────────────────────
  {
    question: `What is the role and department of employee EMP-001?`,
    answer: `Employee EMP-001 (${e001.name}) is a ${e001.role} in the ${e001.department} department, assigned to region ${e001.region_id}.`,
    type: 'easy', hops: 1, entities: ['EMPLOYEE'],
  },
  {
    question: `Which region is employee EMP-010 assigned to?`,
    answer: `Employee EMP-010 (${e010.name}) is assigned to ${e010.region_id}. Role: ${e010.role}, Department: ${e010.department}.`,
    type: 'easy', hops: 1, entities: ['EMPLOYEE'],
  },
  {
    question: `What department does employee EMP-050 work in?`,
    answer: `Employee EMP-050 (${e050.name}) works in the ${e050.department} department as a ${e050.role} in region ${e050.region_id}.`,
    type: 'easy', hops: 1, entities: ['EMPLOYEE'],
  },
  {
    question: `What is the role of employee EMP-100?`,
    answer: `Employee EMP-100 (${e100.name}) has the role of ${e100.role} in the ${e100.department} department.`,
    type: 'easy', hops: 1, entities: ['EMPLOYEE'],
  },
  {
    question: `What is the performance rating of employee EMP-200?`,
    answer: `Employee EMP-200 (${e200.name}) has a performance rating of ${e200.performance}. Role: ${e200.role}, Department: ${e200.department}.`,
    type: 'easy', hops: 1, entities: ['EMPLOYEE'],
  },

  // ── Project lookups (5) ──────────────────────────────────────
  {
    question: `What is the status of project PROJ-NORDIC-001?`,
    answer: proj001
      ? `Project PROJ-NORDIC-001 (${proj001.name}) has status ${proj001.status}. Region: ${proj001.region_id}, Vendor: ${proj001.vendor_id}.`
      : `Project PROJ-NORDIC-001 not found.`,
    type: 'easy', hops: 1, entities: ['PROJECT'],
  },
  {
    question: `Which vendor does project PROJ-NORDIC-001 use?`,
    answer: proj001
      ? `Project PROJ-NORDIC-001 (${proj001.name}) uses vendor ${proj001.vendor_id} in region ${proj001.region_id}.`
      : `Project PROJ-NORDIC-001 not found.`,
    type: 'easy', hops: 1, entities: ['PROJECT','VENDOR'],
  },
  {
    question: `What is the region and status of project PROJ-EMEA-002?`,
    answer: proj002
      ? `Project PROJ-EMEA-002 (${proj002.name}) is in region ${proj002.region_id} with status ${proj002.status}. Vendor: ${proj002.vendor_id}.`
      : `Project PROJ-EMEA-002 not found.`,
    type: 'easy', hops: 1, entities: ['PROJECT','REGION'],
  },
  {
    question: `What is the start and end date of project PROJ-APAC-010?`,
    answer: proj010
      ? `Project PROJ-APAC-010 (${proj010.name}) started on ${proj010.start_date} and is scheduled to end on ${proj010.end_date}. Status: ${proj010.status}.`
      : `Project PROJ-APAC-010 not found.`,
    type: 'easy', hops: 1, entities: ['PROJECT'],
  },
  {
    question: `Who owns project PROJ-NORDIC-001?`,
    answer: proj001
      ? `Project PROJ-NORDIC-001 (${proj001.name}) is owned by ${proj001.owner_id} (${empById[proj001.owner_id]?.name}).`
      : `Project PROJ-NORDIC-001 not found.`,
    type: 'easy', hops: 1, entities: ['PROJECT','EMPLOYEE'],
  },

  // ── Compliance + Ticket lookups (10) ─────────────────────────
  {
    question: `What type and severity is compliance case ${comp001.id}?`,
    answer: `Compliance case ${comp001.id} is a ${comp001.type} case with ${comp001.severity} severity. Status: ${comp001.status}. Customer: ${comp001.customer_id}. Vendor: ${comp001.vendor_id}.`,
    type: 'easy', hops: 1, entities: ['COMPLIANCE'],
  },
  {
    question: `Which customer and vendor are linked to compliance case ${comp001.id}?`,
    answer: `Compliance case ${comp001.id} (${comp001.type}) is linked to customer ${comp001.customer_id} and vendor ${comp001.vendor_id} in region ${comp001.region_id}.`,
    type: 'easy', hops: 1, entities: ['COMPLIANCE','CUSTOMER','VENDOR'],
  },
  {
    question: `What is the status of compliance case ${comp100.id}?`,
    answer: `Compliance case ${comp100.id} (${comp100.type}) has status ${comp100.status} with ${comp100.severity} severity. Customer: ${comp100.customer_id}.`,
    type: 'easy', hops: 1, entities: ['COMPLIANCE'],
  },
  {
    question: `Which region is compliance case ${comp500.id} located in?`,
    answer: `Compliance case ${comp500.id} (${comp500.type}) is located in region ${comp500.region_id}. Vendor: ${comp500.vendor_id}, Severity: ${comp500.severity}.`,
    type: 'easy', hops: 1, entities: ['COMPLIANCE','REGION'],
  },
  {
    question: `What is the priority and category of ticket ${tick001.id}?`,
    answer: `Ticket ${tick001.id} has priority ${tick001.priority} and category ${tick001.category}. Status: ${tick001.status}. Customer: ${tick001.customer_id}.`,
    type: 'easy', hops: 1, entities: ['TICKET'],
  },
  {
    question: `Which customer raised ticket ${tick001.id}, and in which region?`,
    answer: `Ticket ${tick001.id} was raised by customer ${tick001.customer_id} in region ${tick001.region_id}. Vendor involved: ${tick001.vendor_id}.`,
    type: 'easy', hops: 1, entities: ['TICKET','CUSTOMER','REGION'],
  },
  {
    question: `What is the status of ticket ${tick500.id}?`,
    answer: `Ticket ${tick500.id} (${tick500.category}, priority ${tick500.priority}) has status ${tick500.status}. Customer: ${tick500.customer_id}.`,
    type: 'easy', hops: 1, entities: ['TICKET'],
  },
  {
    question: `Which vendor is involved in ticket ${tick500.id}?`,
    answer: `Ticket ${tick500.id} involves vendor ${tick500.vendor_id} in region ${tick500.region_id}. Priority: ${tick500.priority}, Category: ${tick500.category}.`,
    type: 'easy', hops: 1, entities: ['TICKET','VENDOR'],
  },
  {
    question: `What category and priority does ticket ${tick1000.id} have?`,
    answer: `Ticket ${tick1000.id} has category ${tick1000.category} and priority ${tick1000.priority}. Status: ${tick1000.status}. Customer: ${tick1000.customer_id}.`,
    type: 'easy', hops: 1, entities: ['TICKET'],
  },
  {
    question: `Is ticket ${tick1000.id} linked to an outage?`,
    answer: tick1000.outage_id
      ? `Yes, ticket ${tick1000.id} is linked to outage ${tick1000.outage_id}. Vendor: ${tick1000.vendor_id}, Region: ${tick1000.region_id}.`
      : `Ticket ${tick1000.id} is not linked to a known outage. Vendor: ${tick1000.vendor_id}, Region: ${tick1000.region_id}.`,
    type: 'easy', hops: 1, entities: ['TICKET','OUTAGE'],
  },

  // ════════════════════════════════════════════════════════════════
  // MEDIUM (30): 2-hop cross-entity queries — deterministic answers
  // ════════════════════════════════════════════════════════════════

  // ── Outage → Customer chain (10) ────────────────────────────
  {
    question: `How many customers were directly impacted by OUTAGE-001 through shared vendor and region dependency?`,
    answer: `${outage001Customers.length} customers were directly impacted by OUTAGE-001. These customers depend on ${outage001Vendor} (${outage001VendorObj.name}) and are hosted in ${outage001Region}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','VENDOR','REGION','CUSTOMER'],
  },
  {
    question: `How many customers were exposed to OUTAGE-002 through ${o002.vendor_id} in ${o002.region_id}?`,
    answer: `${outage002Customers.length} customers were exposed to OUTAGE-002 through their dependency on ${o002.vendor_id} in ${o002.region_id}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','VENDOR','REGION','CUSTOMER'],
  },
  {
    question: `How many Critical-health customers were exposed to OUTAGE-001?`,
    answer: `${outage001HealthCritical.length} Critical-health customers were exposed to OUTAGE-001. They depend on ${outage001Vendor} in ${outage001Region}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','CUSTOMER'],
  },
  {
    question: `How many Critical-health customers were exposed to OUTAGE-050?`,
    answer: `${outage050CritCustomers.length} Critical-health customers were exposed to OUTAGE-050 through ${o050.vendor_id} in ${o050.region_id}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','CUSTOMER'],
  },
  {
    question: `How many P0 tickets were generated by OUTAGE-001?`,
    answer: `OUTAGE-001 generated ${p0TicketsFromOutage001.length} P0-priority tickets from customers depending on ${outage001Vendor} in ${outage001Region}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','TICKET'],
  },
  {
    question: `How many tickets were generated by OUTAGE-010?`,
    answer: `OUTAGE-010 generated ${outage010Tickets.length} support tickets from affected customers in ${o010.region_id}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','TICKET'],
  },
  {
    question: `How many compliance cases were triggered by OUTAGE-001?`,
    answer: `OUTAGE-001 triggered ${compCasesFromOutage001.length} compliance cases across customers depending on ${outage001Vendor} in ${outage001Region}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','COMPLIANCE'],
  },
  {
    question: `How many compliance cases were triggered by OUTAGE-020?`,
    answer: `OUTAGE-020 triggered ${outage020CompCases.length} compliance cases. Vendor responsible: ${o020.vendor_id}, Region: ${o020.region_id}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','COMPLIANCE'],
  },
  {
    question: `How many projects in ${outage001Region} were impacted by OUTAGE-001?`,
    answer: `${outage001Projects.length} projects in ${outage001Region} using ${outage001Vendor} infrastructure were impacted by OUTAGE-001.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','REGION','PROJECT'],
  },
  {
    question: `How many total outages has ${outage001Vendor} (OUTAGE-001's vendor) caused across all regions?`,
    answer: `Vendor ${outage001Vendor} (${outage001VendorObj.name}), responsible for OUTAGE-001, has caused ${outage001VendorOutages} total outages across all regions.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','VENDOR'],
  },

  // ── Vendor → aggregation (10) ─────────────────────────────────
  {
    question: `How many customers depend on VEND-01 as their primary vendor?`,
    answer: `${vend01Custs} customers depend on VEND-01 (${v01.name}) as their primary vendor.`,
    type: 'medium', hops: 2, entities: ['VENDOR','CUSTOMER'],
  },
  {
    question: `How many customers depend on VEND-05 as their primary vendor?`,
    answer: `${vend05Custs} customers depend on VEND-05 (${v05.name}) as their primary vendor.`,
    type: 'medium', hops: 2, entities: ['VENDOR','CUSTOMER'],
  },
  {
    question: `How many customers depend on VEND-10?`,
    answer: `${vend10Custs} customers depend on VEND-10 (${v10.name}) as their primary vendor.`,
    type: 'medium', hops: 2, entities: ['VENDOR','CUSTOMER'],
  },
  {
    question: `How many P0 outages has VEND-01 experienced?`,
    answer: `Vendor VEND-01 (${v01.name}) has experienced ${vend01P0Outages.length} P0-severity outages.`,
    type: 'medium', hops: 2, entities: ['VENDOR','OUTAGE'],
  },
  {
    question: `How many compliance cases are linked to VEND-01?`,
    answer: `Vendor VEND-01 (${v01.name}) is linked to ${vend01CompCases.length} compliance cases across all regions.`,
    type: 'medium', hops: 2, entities: ['VENDOR','COMPLIANCE'],
  },
  {
    question: `Which vendor has caused the most outages overall?`,
    answer: `Vendor ${topVendorByOutages.id} (${topVendorByOutages.name}) has caused the most outages with ${topVendorByOutages.count} total outages recorded.`,
    type: 'medium', hops: 2, entities: ['VENDOR','OUTAGE'],
  },
  {
    question: `Which vendor is linked to the most compliance cases?`,
    answer: `Vendor ${topVendorByComp.id} (${topVendorByComp.name}) is linked to the most compliance cases with ${topVendorByComp.count} cases.`,
    type: 'medium', hops: 2, entities: ['VENDOR','COMPLIANCE'],
  },
  {
    question: `Which vendor has the most Critical-health customer accounts?`,
    answer: `Vendor ${topVendorByCrit.id} (${topVendorByCrit.name}) has the most Critical-health customer accounts with ${topVendorByCrit.count} Critical accounts depending on it.`,
    type: 'medium', hops: 2, entities: ['VENDOR','CUSTOMER'],
  },
  {
    question: `Which vendor has accumulated the most total outage downtime in hours?`,
    answer: `Vendor ${topVendorByDowntime.id} (${topVendorByDowntime.name}) has accumulated the most downtime with ${topVendorByDowntime.hours} total hours across all its outages.`,
    type: 'medium', hops: 2, entities: ['VENDOR','OUTAGE'],
  },
  {
    question: `Which outage has impacted the most customers through shared vendor-region dependency?`,
    answer: `Outage ${topOutageByImpact.id} impacted the most customers: ${topOutageByImpact.count} customers in ${topOutageByImpact.region} who depend on ${topOutageByImpact.vendor}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','VENDOR','REGION','CUSTOMER'],
  },

  // ── Region → aggregation (10) ──────────────────────────────────
  {
    question: `How many customers are hosted in REGION-FRANKFURT?`,
    answer: `${ffmCustomers.length} customers are hosted in REGION-FRANKFURT.`,
    type: 'medium', hops: 2, entities: ['REGION','CUSTOMER'],
  },
  {
    question: `How many Critical-health customers are in REGION-FRANKFURT?`,
    answer: `${ffmCritCustomers.length} customers in REGION-FRANKFURT have Critical health status.`,
    type: 'medium', hops: 2, entities: ['REGION','CUSTOMER'],
  },
  {
    question: `How many outages have occurred in REGION-FRANKFURT, and what is the total downtime?`,
    answer: `REGION-FRANKFURT has experienced ${ffmOutages.length} outages with a total downtime of ${ffmOutages.reduce((s,o)=>s+o.duration_hrs,0)} hours.`,
    type: 'medium', hops: 2, entities: ['REGION','OUTAGE'],
  },
  {
    question: `How many compliance cases originated from REGION-FRANKFURT?`,
    answer: `${ffmCompCases.length} compliance cases originated from REGION-FRANKFURT.`,
    type: 'medium', hops: 2, entities: ['REGION','COMPLIANCE'],
  },
  {
    question: `What is the total ARR of all customers hosted in REGION-FRANKFURT?`,
    answer: `The total ARR of all ${ffmCustomers.length} customers in REGION-FRANKFURT is $${ffmARR.toLocaleString()}.`,
    type: 'medium', hops: 2, entities: ['REGION','CUSTOMER'],
  },
  {
    question: `How many customers are hosted in REGION-SINGAPORE?`,
    answer: `${sinCustomers.length} customers are hosted in REGION-SINGAPORE.`,
    type: 'medium', hops: 2, entities: ['REGION','CUSTOMER'],
  },
  {
    question: `How many Critical-health customers are in REGION-SINGAPORE?`,
    answer: `${sinCritCustomers.length} customers in REGION-SINGAPORE have Critical health status.`,
    type: 'medium', hops: 2, entities: ['REGION','CUSTOMER'],
  },
  {
    question: `Which region had the most P0-severity outages?`,
    answer: `Region ${topRegionByP0.id} had the most P0-severity outages with ${topRegionByP0.count} P0 incidents.`,
    type: 'medium', hops: 2, entities: ['REGION','OUTAGE'],
  },
  {
    question: `Which outage caused the most compliance cases?`,
    answer: `Outage ${topOutageByComp.id} caused the most compliance cases with ${topOutageByComp.count} cases. Vendor responsible: ${topOutageByComp.vendor}.`,
    type: 'medium', hops: 2, entities: ['OUTAGE','COMPLIANCE','VENDOR'],
  },
  {
    question: `Which employee manages the most Critical-health customer accounts?`,
    answer: `Employee ${topEmpByCrit.id} (${empById[topEmpByCrit.id]?.name}) manages the most Critical-health accounts with ${topEmpByCrit.count} Critical-health customers assigned.`,
    type: 'medium', hops: 2, entities: ['EMPLOYEE','CUSTOMER'],
  },
];

writeFileSync(join(OUT_DIR,'eval_questions.json'), JSON.stringify(evalQuestions, null, 2));
console.log(`  → ${evalQuestions.length} eval questions written`);

// ── Graph metadata summary ─────────────────────────────────────────────────────
const graphMeta = {
  vertex_count: vendors.length + regions.length + outages.length + projects.length + employees.length + products.length + customers.length + compCases.length + tickets.length,
  edge_count: edges.length,
  avg_degree: (edges.length * 2 / (vendors.length + regions.length + outages.length + projects.length + employees.length + products.length + customers.length + compCases.length + tickets.length)).toFixed(2),
  document_count: chunks.length,
  estimated_tokens_M: (estTokens/1_000_000).toFixed(1),
  entities: { vendors: vendors.length, regions: regions.length, outages: outages.length, projects: projects.length, employees: employees.length, products: products.length, customers: customers.length, compliance: compCases.length, tickets: tickets.length },
};
writeFileSync(join(OUT_DIR,'graph_meta.json'), JSON.stringify(graphMeta, null, 2));
console.log('\nGraph metadata:');
console.log(JSON.stringify(graphMeta, null, 2));
console.log('\nOutput: data/crm/');
console.log('  chunks.jsonl          — TigerGraph ingest (same format as before)');
console.log('  edges.jsonl           — explicit edge graph');
console.log('  eval_questions.json   — 80 eval questions (50 easy + 30 medium)');
console.log('  graph_meta.json       — graph statistics');
console.log('  *.json                — entity tables');
