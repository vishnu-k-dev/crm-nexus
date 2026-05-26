/**
 * Activity Log Generator — ~27M extra tokens (→ 150M total dataset)
 *
 * Generates 4 types of realistic CRM activity filler data:
 *   CustomerCallLog  — inbound/outbound call records
 *   EmailThread      — multi-turn customer email threads
 *   SupportNote      — internal analyst notes on tickets
 *   AuditEntry       — system audit trail entries
 *
 * Output: data/activity_ingest.jsonl
 * Format: {doc_id, doc_type: "character", content}  (same as crm_ingest.jsonl)
 *
 * Target: 108M characters ≈ 27M tokens → brings total from 123M → 150M
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../data/activity_ingest.jsonl');
const TARGET_CHARS = 108_000_000; // ~27M tokens at 4 chars/token

// ── Seeded random (same pattern as generate-crm.ts) ───────────────────────────
let seed = 99991;
function rand(): number { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(seed) / 0x80000000; }
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]!; }
function randInt(min: number, max: number): number { return Math.floor(rand() * (max - min + 1)) + min; }
function pad(n: number, w: number): string { return String(n).padStart(w, '0'); }

// ── Entity pools (matching existing data IDs) ─────────────────────────────────
const CUST_IDS  = Array.from({ length: 5000 }, (_, i) => `CUST-${pad(i + 1, 4)}`);
const EMP_IDS   = Array.from({ length: 500  }, (_, i) => `EMP-${pad(i + 1, 3)}`);
const VEND_IDS  = Array.from({ length: 50   }, (_, i) => `VEND-${pad(i + 1, 2)}`);
const TICK_IDS  = Array.from({ length: 25000}, (_, i) => `TICK-${pad(i + 1, 5)}`);

const FIRST = ['James','Emily','Michael','Sarah','David','Jessica','Robert','Ashley','John','Amanda',
               'William','Megan','Richard','Lauren','Thomas','Rachel','Charles','Hannah','Daniel',
               'Stephanie','Matthew','Nicole','Anthony','Elizabeth','Mark','Heather','Donald','Amy'];
const LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez',
               'Martinez','Hernandez','Lopez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson',
               'Martin','Lee','Perez','Thompson','White','Harris','Clark','Ramirez','Lewis','Robinson'];
const COMPANIES = ['Acme Corp','GlobalTech Solutions','Pinnacle Enterprises','Vertex Systems',
                   'Nexus Industries','Apex Dynamics','Quantum Holdings','Stellar Technologies',
                   'Horizon Group','Meridian Solutions','Catalyst Partners','Fusion Networks',
                   'Summit Analytics','Vanguard Systems','Prism Technologies','Eclipse Solutions',
                   'Zenith Innovations','Omega Group','Atlas Consulting','Solaris Enterprises'];
const PRODUCTS = ['CRM Enterprise','Analytics Suite','Support Desk','Marketing Hub',
                  'Sales Intelligence','Revenue Intelligence','Identity Platform',
                  'Compliance Manager','API Gateway','Data Bridge','Workflow Engine'];
const TOPICS_CALL = [
  'subscription renewal inquiry','billing discrepancy resolution','feature demo request',
  'integration setup assistance','onboarding progress check','SLA review and escalation',
  'product roadmap inquiry','contract amendment discussion','churn risk follow-up',
  'upsell / expansion opportunity','outage impact debrief','performance issue report',
  'security audit request','compliance documentation review','API rate limit inquiry',
  'dashboard customization help','data export request','user access management',
  'quarterly business review prep','vendor dependency clarification',
];
const TOPICS_EMAIL = [
  'Re: Integration setup issue','Re: Renewal quote for FY2026','Re: Outage incident report',
  'Re: SLA breach notification','Re: Feature request follow-up','Re: User provisioning',
  'Re: Data migration planning','Re: Security audit checklist','Re: API documentation',
  'Re: Contract amendment approval','Re: QBR action items','Re: Support ticket update',
  'Re: Product upgrade timeline','Re: Billing adjustment','Re: Compliance certification',
];
const SENTIMENTS = ['Very Positive','Positive','Neutral','Slightly Negative','Frustrated'];
const ISSUE_TYPES = ['sync failure','API timeout','login error','data export issue',
                     'dashboard loading slow','webhook not firing','SSO misconfiguration',
                     'rate limit exceeded','permission denied error','notification failure'];
const AUDIT_ACTIONS = ['RECORD_UPDATE','BULK_EXPORT','USER_LOGIN','PERMISSION_CHANGE',
                       'DATA_DELETE','RECORD_CREATE','ROLE_ASSIGN','CONFIG_UPDATE',
                       'BULK_IMPORT','PASSWORD_RESET','API_KEY_ROTATE','SESSION_EXPIRE'];
const REGIONS = ['US-EAST','US-WEST','EU-FRANKFURT','EU-LONDON','APAC-SINGAPORE','CA-TORONTO',
                 'US-CENTRAL','EU-AMSTERDAM','APAC-SYDNEY','SA-SAOPAULO'];

// ── Date helpers ──────────────────────────────────────────────────────────────
function randDate(): string {
  const y = randInt(2024, 2026);
  const m = randInt(1, 12);
  const d = randInt(1, 28);
  const h = randInt(8, 18);
  const min = randInt(0, 59);
  const s = randInt(0, 59);
  return `${y}-${pad(m,2)}-${pad(d,2)} ${pad(h,2)}:${pad(min,2)}:${pad(s,2)}`;
}
function futureDays(base: string, days: number): string {
  const d = new Date(base.replace(' ', 'T') + 'Z');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function empName(): string { return `${pick(FIRST)} ${pick(LAST)}`; }
function companyFor(custId: string): string { return COMPANIES[parseInt(custId.split('-')[1]!) % COMPANIES.length]!; }

// ── Generator: CustomerCallLog ────────────────────────────────────────────────
function genCallLog(idx: number): string {
  const custId  = pick(CUST_IDS);
  const empId   = pick(EMP_IDS);
  const rep     = empName();
  const company = companyFor(custId);
  const product = pick(PRODUCTS);
  const topic   = pick(TOPICS_CALL);
  const dur     = randInt(5, 45);
  const date    = randDate();
  const sent    = pick(SENTIMENTS);
  const tickRef = rand() > 0.4 ? pick(TICK_IDS) : null;
  const vendRef = rand() > 0.6 ? pick(VEND_IDS) : null;
  const nxtDays = randInt(3, 21);
  const nxtDate = futureDays(date, nxtDays);

  const actionItems = [];
  if (rand() > 0.3) actionItems.push(`Send follow-up email to ${custId} by ${futureDays(date, 2)}`);
  if (rand() > 0.4) actionItems.push(`Update account health score in CRM dashboard`);
  if (rand() > 0.5) actionItems.push(`Escalate ${tickRef ?? 'open ticket'} to Tier-2 engineering`);
  if (rand() > 0.6) actionItems.push(`Schedule ${product} demo for ${futureDays(date, nxtDays)}`);
  if (rand() > 0.7) actionItems.push(`Prepare renewal quote — estimated ARR: $${randInt(12,480)}k`);
  if (vendRef && rand() > 0.5) actionItems.push(`Review ${vendRef} SLA compliance report`);

  const notes = [
    `Customer expressed ${sent.toLowerCase()} sentiment regarding recent ${pick(['platform performance','API stability','support response times','billing transparency','feature parity'])}.`,
    `Rep confirmed ${rand() > 0.5 ? 'successful' : 'pending'} resolution of ${rand() > 0.5 ? 'the reported issue' : `ticket ${tickRef ?? 'previous incident'}`}.`,
    rand() > 0.4 ? `Customer referenced competitor evaluation — mentioned ${pick(['Salesforce','HubSpot','Zendesk','Freshworks','Monday.com'])} as alternative being considered.` : '',
    rand() > 0.5 ? `Discussed roadmap item: ${pick(['AI-powered forecasting','SSO/SAML v2','bulk API endpoints','enhanced audit logs','multi-region failover'])} — customer confirmed high priority.` : '',
    rand() > 0.6 ? `Vendor dependency ${vendRef ?? pick(VEND_IDS)} flagged as potential risk factor in customer\'s infrastructure review.` : '',
  ].filter(Boolean).join(' ');

  return [
    `CRM Activity Log — ${rand() > 0.5 ? 'Inbound' : 'Outbound'} Call`,
    `Log ID:      ACTV-C-${pad(idx, 6)}`,
    `Date:        ${date} UTC`,
    `Customer:    ${custId} (${company})`,
    `Assigned:    ${empId} (${rep})`,
    `Product:     ${product}`,
    `Topic:       ${topic}`,
    `Duration:    ${dur} min`,
    `Sentiment:   ${sent}`,
    ``,
    `Call Summary:`,
    notes,
    ``,
    `Action Items:`,
    ...actionItems.map(a => `  • ${a}`),
    ``,
    `Next Contact: ${nxtDate}`,
    tickRef ? `Ticket Ref:   ${tickRef}` : '',
    vendRef ? `Vendor Ref:   ${vendRef}` : '',
    `Recorded by: ${empId}`,
  ].filter(l => l !== undefined).join('\n');
}

// ── Generator: EmailThread ────────────────────────────────────────────────────
function genEmailThread(idx: number): string {
  const custId  = pick(CUST_IDS);
  const empId   = pick(EMP_IDS);
  const rep     = empName();
  const company = companyFor(custId);
  const product = pick(PRODUCTS);
  const subject = pick(TOPICS_EMAIL);
  const turns   = randInt(2, 5);
  const baseDate = randDate();
  const tickRef = rand() > 0.4 ? pick(TICK_IDS) : null;

  const header = [
    `Email Thread — Customer Communication`,
    `Thread ID:   ACTV-E-${pad(idx, 6)}`,
    `Subject:     ${subject}`,
    `Customer:    ${custId} (${company})`,
    `Rep:         ${empId} (${rep})`,
    `Product:     ${product}`,
    tickRef ? `Ticket Ref:  ${tickRef}` : '',
    `Turns:       ${turns}`,
    ``,
  ].filter(l => l !== undefined).join('\n');

  const messages: string[] = [];
  for (let t = 0; t < turns; t++) {
    const sender   = t % 2 === 0 ? `Customer (${custId})` : `${empId} (${rep})`;
    const msgDate  = futureDays(baseDate, t);
    const hour     = randInt(8, 17);
    const msgTime  = `${msgDate} ${pad(hour, 2)}:${pad(randInt(0,59),2)}`;
    const isCustomer = t % 2 === 0;

    let body = '';
    if (isCustomer) {
      const issues = [
        `We are experiencing ${pick(ISSUE_TYPES)} on our ${product} instance since ${futureDays(baseDate, -randInt(1,5))}. This is impacting ${randInt(5,200)} users across our ${pick(['US','EU','APAC'])} environment.`,
        `I wanted to follow up on ${tickRef ? `ticket ${tickRef}` : 'our previous conversation'} regarding the ${pick(['renewal timeline','integration setup','data migration plan','compliance requirements'])}.`,
        `Our team reviewed the proposal you sent and has ${pick(['a few questions','some concerns','approved it','requested modifications'])} regarding the ${pick(['pricing structure','implementation timeline','SLA terms','support coverage'])}.`,
        `Could you provide an update on ${pick(['the open support case','our API rate limit request','the SSO configuration','the bulk data export'])}? We need this resolved before our ${pick(['board meeting','go-live date','compliance audit','renewal decision'])} on ${futureDays(baseDate, randInt(7,30))}.`,
      ];
      body = pick(issues);
    } else {
      const responses = [
        `Thank you for reaching out about this. I\'ve reviewed ${tickRef ? `ticket ${tickRef}` : 'your account'} and can confirm that ${pick(['our engineering team is actively investigating','a fix has been deployed to','the issue was traced to','the root cause has been identified as'])} ${pick(['a configuration change on 2025-03-10','a known issue in version 2.4.1 — patch available','a network routing issue in the EU region','a database indexing problem — resolved in 99.2% of cases'])}.`,
        `I appreciate your patience on this. The ${pick(['engineering','platform','security','integrations'])} team has ${pick(['scheduled a fix for','deployed a hotfix to','opened a P1 incident for','assigned a senior engineer to'])} your environment. Expected resolution: ${futureDays(baseDate, randInt(1,7))}.`,
        `I\'ve escalated this internally and can confirm that ${pick(['the SLA breach has been logged','a credit has been applied','the compliance documentation is ready','the renewal quote has been updated'])}. Please find the ${pick(['updated proposal','incident report','configuration guide','data sheet'])} attached.`,
      ];
      body = pick(responses);
    }

    messages.push(`[${msgTime}] ${sender}:\n${body}`);
  }

  const resolution = rand() > 0.4
    ? `\nResolution: ${pick(['Resolved — customer confirmed fix working','Pending — awaiting customer confirmation','Escalated to Tier-2','Closed — no further action required','Follow-up scheduled'])}\n`
    : '\n';

  return header + messages.join('\n\n---\n\n') + resolution;
}

// ── Generator: SupportNote ────────────────────────────────────────────────────
function genSupportNote(idx: number): string {
  const custId   = pick(CUST_IDS);
  const empId    = pick(EMP_IDS);
  const analyst  = empName();
  const tickId   = pick(TICK_IDS);
  const product  = pick(PRODUCTS);
  const issue    = pick(ISSUE_TYPES);
  const date     = randDate();
  const priority = pick(['P1 — Critical','P2 — High','P3 — Medium','P4 — Low']);
  const vendRef  = rand() > 0.5 ? pick(VEND_IDS) : null;

  const rootCauses = [
    `OAuth token refresh race condition under high concurrency (>200 req/s).`,
    `Database connection pool exhaustion during peak load window (08:00–10:00 UTC).`,
    `TLS certificate mismatch between load balancer and backend service.`,
    `Misconfigured webhook endpoint — customer\'s firewall blocking port 443 outbound.`,
    `API rate limit set at account level rather than per-endpoint — caused false throttling.`,
    `Redis cache key collision causing stale session data for ${randInt(10,500)} users.`,
    `Schema migration in v${randInt(2,8)}.${randInt(0,9)}.${randInt(0,9)} introduced breaking change in bulk export endpoint.`,
    `Third-party SSO provider (${pick(['Okta','Azure AD','Google Workspace','Ping Identity'])}) token validation timeout.`,
    vendRef ? `Vendor ${vendRef} API returned malformed JSON payload — triggered downstream parse error.` : `Intermittent network partition in ${pick(REGIONS)} region causing 503 errors.`,
  ];

  const workarounds = [
    `Restart ${product} agent service on customer tenant — confirmed resolved for ${randInt(80,100)}% of affected users.`,
    `Apply config patch: set connection_pool_size=50, connection_timeout=30s in tenant settings.`,
    `Whitelist IP range 10.42.0.0/16 in customer firewall — confirmed fix applied.`,
    `Roll back to v${randInt(2,7)}.${randInt(0,9)}.${randInt(0,9)} on customer tenant pending permanent fix release.`,
    `Increase per-tenant rate limit to ${randInt(500,5000)} req/min as temporary relief.`,
    `Clear Redis session cache for affected user pool — all ${randInt(5,200)} users confirmed re-authenticated.`,
  ];

  return [
    `Internal Support Note`,
    `Note ID:     ACTV-N-${pad(idx, 6)}`,
    `Ticket:      ${tickId}`,
    `Date:        ${date} UTC`,
    `Analyst:     ${empId} (${analyst})`,
    `Customer:    ${custId}`,
    `Product:     ${product}`,
    `Priority:    ${priority}`,
    vendRef ? `Vendor Dep:  ${vendRef}` : '',
    ``,
    `Issue:`,
    `  Customer reports ${issue} affecting production environment.`,
    `  Reported: ${date}   Impacted users: ${randInt(1, 500)}`,
    ``,
    `Investigation:`,
    `  ${pick(rootCauses)}`,
    rand() > 0.5 ? `  Secondary factor: ${pick(['recent infrastructure change','vendor maintenance window','customer config change','platform version upgrade'])} on ${futureDays(date, -randInt(1,7))}.` : '',
    ``,
    `Workaround Applied:`,
    `  ${pick(workarounds)}`,
    ``,
    `Permanent Fix:`,
    `  Scheduled for ${product} v${randInt(2,9)}.${randInt(0,9)}.${randInt(1,9)} — ETA ${futureDays(date, randInt(7, 45))}.`,
    `  Engineering ticket: ENG-${randInt(10000, 99999)}`,
    ``,
    `Status: ${pick(['Workaround active — monitoring','Resolved — closed','Escalated to engineering','Pending customer confirmation'])}`,
  ].filter(l => l !== undefined && l !== '').join('\n');
}

// ── Generator: AuditEntry ─────────────────────────────────────────────────────
function genAuditEntry(idx: number): string {
  const empId   = pick(EMP_IDS);
  const actor   = empName();
  const action  = pick(AUDIT_ACTIONS);
  const date    = randDate();
  const custId  = rand() > 0.3 ? pick(CUST_IDS) : null;
  const vendRef = rand() > 0.6 ? pick(VEND_IDS) : null;
  const region  = pick(REGIONS);
  const scope   = randInt(1, 5000);

  const resources: Record<string, string> = {
    RECORD_UPDATE: 'Customer Records',    BULK_EXPORT: 'CRM Data Export',
    USER_LOGIN: 'Authentication Service', PERMISSION_CHANGE: 'RBAC Policy',
    DATA_DELETE: 'Archived Records',      RECORD_CREATE: 'Lead Records',
    ROLE_ASSIGN: 'User Management',       CONFIG_UPDATE: 'Tenant Configuration',
    BULK_IMPORT: 'Contact Records',       PASSWORD_RESET: 'Auth Credentials',
    API_KEY_ROTATE: 'API Key Store',      SESSION_EXPIRE: 'Session Registry',
  };

  const statusMessages: Record<string, string> = {
    RECORD_UPDATE: `${scope} records updated successfully`,
    BULK_EXPORT: `${scope} records exported to ${pick(['S3','GCS','Azure Blob','SFTP'])}`,
    USER_LOGIN: `Authentication ${rand() > 0.1 ? 'succeeded' : 'failed — MFA challenge triggered'}`,
    PERMISSION_CHANGE: `Policy updated — ${pick(['read','write','admin','export'])} permission ${pick(['granted','revoked','modified'])}`,
    DATA_DELETE: `${scope} archived records purged — retention policy: ${randInt(1,7)} years`,
    RECORD_CREATE: `${scope} new leads created`,
    ROLE_ASSIGN: `Role "${pick(['admin','viewer','editor','billing_manager','support_agent'])}" assigned to ${randInt(1,50)} users`,
    CONFIG_UPDATE: `${pick(['SSO settings','webhook URL','rate limit','data retention policy','API timeout'])} updated`,
    BULK_IMPORT: `${scope} records imported — ${randInt(0, Math.floor(scope * 0.05))} duplicates merged`,
    PASSWORD_RESET: `Password reset link sent to ${randInt(1,20)} users`,
    API_KEY_ROTATE: `API key rotated — previous key invalidated`,
    SESSION_EXPIRE: `${scope} idle sessions expired — region: ${region}`,
  };

  return [
    `Audit Log Entry`,
    `Entry ID:    AUD-${pad(idx, 8)}`,
    `Timestamp:   ${date} UTC`,
    `Actor:       ${empId} (${actor})`,
    `Action:      ${action}`,
    `Resource:    ${resources[action] ?? 'System Resource'}`,
    custId ? `Customer:    ${custId}` : '',
    vendRef ? `Vendor:      ${vendRef}` : '',
    `Region:      ${region}`,
    `Session:     sess_${Math.abs(seed & 0xffffff).toString(16).padStart(8,'0')}`,
    `IP:          10.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`,
    ``,
    `Details:`,
    `  ${statusMessages[action] ?? 'Operation completed'}`,
    rand() > 0.5 ? `  Approval: ${pick(EMP_IDS)} (${pick(['System Admin','Compliance Officer','VP Engineering','CISO'])})` : '',
    rand() > 0.6 ? `  Compliance tag: ${pick(['SOC2-CC6.1','GDPR-Art17','HIPAA-164.312','ISO27001-A.12.4','PCI-DSS-10.3'])}` : '',
    ``,
    `Result:      ${rand() > 0.05 ? 'SUCCESS' : 'PARTIAL — see error log ENG-' + randInt(10000,99999)}`,
  ].filter(l => l !== undefined && l !== '').join('\n');
}

// ── Main: generate until TARGET_CHARS reached ─────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  Activity Log Generator — 150M Token Dataset Filler');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Target: ${(TARGET_CHARS / 4_000_000).toFixed(0)}M tokens (~${TARGET_CHARS.toLocaleString()} chars)`);
console.log('');

const lines: string[] = [];
let totalChars = 0;
let callIdx = 1, emailIdx = 1, noteIdx = 1, auditIdx = 1;
const LOG_EVERY = 5000;

// Interleave all 4 types in a round-robin until target is hit
const generators = [
  () => { const c = genCallLog(callIdx++);   return { id: `act_call_ACTV-C-${pad(callIdx,6)}`,  content: c }; },
  () => { const c = genEmailThread(emailIdx++); return { id: `act_email_ACTV-E-${pad(emailIdx,6)}`, content: c }; },
  () => { const c = genSupportNote(noteIdx++);  return { id: `act_note_ACTV-N-${pad(noteIdx,6)}`,  content: c }; },
  () => { const c = genAuditEntry(auditIdx++);  return { id: `act_audit_AUD-${pad(auditIdx,8)}`,   content: c }; },
  // Double up call logs and support notes (most common in real CRM)
  () => { const c = genCallLog(callIdx++);   return { id: `act_call_ACTV-C-${pad(callIdx,6)}`,  content: c }; },
  () => { const c = genSupportNote(noteIdx++);  return { id: `act_note_ACTV-N-${pad(noteIdx,6)}`,  content: c }; },
];

let genIdx = 0;
let docCount = 0;

while (totalChars < TARGET_CHARS) {
  const gen = generators[genIdx % generators.length]!;
  genIdx++;

  const { id, content } = gen();
  const line = JSON.stringify({ doc_id: id, doc_type: 'character', content });

  lines.push(line);
  totalChars += content.length;
  docCount++;

  if (docCount % LOG_EVERY === 0) {
    const pct = ((totalChars / TARGET_CHARS) * 100).toFixed(1);
    const toks = (totalChars / 4_000_000).toFixed(1);
    console.log(`  ${docCount.toLocaleString()} docs | ${toks}M chars generated (${pct}% of target)`);
  }
}

writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');

const totalTokensM  = (totalChars / 4_000_000).toFixed(2);
const existingM     = 123;
const projectedM    = (existingM + parseFloat(totalTokensM)).toFixed(1);

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log(`  ✅ Generation complete!`);
console.log(`     Documents:   ${docCount.toLocaleString()}`);
console.log(`     Chars:       ${(totalChars / 1_000_000).toFixed(1)}M`);
console.log(`     New tokens:  ~${totalTokensM}M`);
console.log(`     Total:       ~${projectedM}M tokens (was ${existingM}M)`);
console.log(`     Output:      data/activity_ingest.jsonl`);
console.log('');
console.log('  Next: npx tsx scripts/ingest-activity-logs.ts');
console.log('═══════════════════════════════════════════════════════');
