/**
 * Activity Log Generator v2 — ~51M extra tokens (→ 201M total dataset)
 *
 * Second batch of CRM activity filler data. Uses a different seed and
 * doc-ID prefix (act2_) so IDs never collide with batch 1.
 *
 * Output: data/activity_ingest_v2.jsonl
 * Format: {doc_id, doc_type: "character", content}  (same loading job)
 *
 * Target: 204M characters ≈ 51M tokens → brings total from 150M → 201M
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../data/activity_ingest_v2.jsonl');
const TARGET_CHARS = 204_000_000; // ~51M tokens at 4 chars/token

// ── Seeded random (different seed from v1) ────────────────────────────────────
let seed = 77773;
function rand(): number { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(seed) / 0x80000000; }
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]!; }
function randInt(min: number, max: number): number { return Math.floor(rand() * (max - min + 1)) + min; }
function pad(n: number, w: number): string { return String(n).padStart(w, '0'); }

// ── Entity pools (same IDs as the core CRM data) ─────────────────────────────
const CUST_IDS  = Array.from({ length: 5000 }, (_, i) => `CUST-${pad(i + 1, 4)}`);
const EMP_IDS   = Array.from({ length: 500  }, (_, i) => `EMP-${pad(i + 1, 3)}`);
const VEND_IDS  = Array.from({ length: 50   }, (_, i) => `VEND-${pad(i + 1, 2)}`);
const TICK_IDS  = Array.from({ length: 25000}, (_, i) => `TICK-${pad(i + 1, 5)}`);
const PROJ_IDS  = Array.from({ length: 200  }, (_, i) => `PROJ-${pad(i + 1, 4)}`);

const FIRST = ['Liam','Olivia','Noah','Emma','Oliver','Ava','William','Sophia','James','Isabella',
               'Benjamin','Mia','Lucas','Charlotte','Henry','Amelia','Alexander','Harper','Mason',
               'Evelyn','Ethan','Abigail','Daniel','Emily','Logan','Elizabeth','Jackson','Sofia'];
const LAST  = ['Walker','Hall','Allen','Young','Hernandez','King','Wright','Lopez','Hill','Scott',
               'Green','Adams','Baker','Gonzalez','Nelson','Carter','Mitchell','Perez','Roberts',
               'Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Sanchez'];
const COMPANIES = ['Orbit Systems','Cascade Technologies','Ironclad Solutions','BlueSky Analytics',
                   'TrueNorth Consulting','Radiant Networks','Keystone Enterprises','Forge Digital',
                   'Silverline Group','Clarity Partners','Bridgepoint Systems','Redwood Technologies',
                   'Crestview Analytics','Pathfinder Solutions','Apex Digital','Lodestar Consulting',
                   'Mainsail Technologies','Lighthouse Systems','Granite Analytics','Stoneway Group'];
const PRODUCTS = ['CRM Enterprise','Analytics Suite','Support Desk','Marketing Hub',
                  'Sales Intelligence','Revenue Intelligence','Identity Platform',
                  'Compliance Manager','API Gateway','Data Bridge','Workflow Engine','Insights Pro'];
const TOPICS_CALL = [
  'annual contract renewal negotiation','technical escalation — data sync failure',
  'product feature adoption review','executive business review prep',
  'security vulnerability disclosure','disaster recovery plan review',
  'multi-region deployment discussion','SLA performance debrief',
  'pricing tier migration inquiry','vendor risk assessment update',
  'user training and onboarding call','compliance gap analysis',
  'churn risk intervention','expansion opportunity discovery',
  'API integration troubleshooting','data migration planning',
  'platform performance benchmarking','incident post-mortem review',
  'product roadmap alignment','contract amendment negotiation',
];
const TOPICS_EMAIL = [
  'Re: Annual renewal proposal FY2026','Re: Critical incident — service degradation',
  'Re: New feature deployment timeline','Re: Compliance audit requirements',
  'Re: Multi-region expansion pricing','Re: SLA breach credit request',
  'Re: User access provisioning','Re: Vendor dependency risk report',
  'Re: Data retention policy update','Re: Security penetration test results',
  'Re: API versioning migration','Re: QBR follow-up action items',
  'Re: Platform upgrade approval','Re: Training session scheduling',
  'Re: Contract amendment — addendum B',
];
const SENTIMENTS = ['Highly Satisfied','Satisfied','Neutral','Concerned','At Risk of Churn'];
const ISSUE_TYPES = ['data replication lag','authentication token expiry','bulk export timeout',
                     'dashboard rendering error','API endpoint 503','webhook delivery failure',
                     'SSO loop on login','report generation hang','notification queue backlog',
                     'role permission mismatch','search index staleness','session invalidation'];
const AUDIT_ACTIONS = ['RECORD_UPDATE','BULK_EXPORT','USER_LOGIN','PERMISSION_CHANGE',
                       'DATA_DELETE','RECORD_CREATE','ROLE_ASSIGN','CONFIG_UPDATE',
                       'BULK_IMPORT','PASSWORD_RESET','API_KEY_ROTATE','SESSION_EXPIRE',
                       'MFA_ENROLL','REPORT_GENERATE','WEBHOOK_CREATE','INTEGRATION_ENABLE'];
const REGIONS = ['US-EAST-1','US-WEST-2','EU-CENTRAL-1','EU-WEST-1','AP-SOUTHEAST-1',
                 'CA-CENTRAL-1','US-SOUTH-1','EU-NORTH-1','AP-NORTHEAST-1','SA-EAST-1'];
const CONTRACT_TYPES = ['Enterprise Annual','Enterprise Multi-Year','Professional Monthly',
                        'Startup Annual','Enterprise Plus','Custom Enterprise'];

// ── Date helpers ──────────────────────────────────────────────────────────────
function randDate(): string {
  const y = randInt(2024, 2026);
  const m = randInt(1, 12);
  const d = randInt(1, 28);
  const h = randInt(7, 19);
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

// ── Generator: CustomerCallLog v2 ────────────────────────────────────────────
function genCallLog(idx: number): string {
  const custId  = pick(CUST_IDS);
  const empId   = pick(EMP_IDS);
  const rep     = empName();
  const company = companyFor(custId);
  const product = pick(PRODUCTS);
  const topic   = pick(TOPICS_CALL);
  const dur     = randInt(8, 60);
  const date    = randDate();
  const sent    = pick(SENTIMENTS);
  const tickRef = rand() > 0.35 ? pick(TICK_IDS) : null;
  const vendRef = rand() > 0.55 ? pick(VEND_IDS) : null;
  const projRef = rand() > 0.65 ? pick(PROJ_IDS) : null;
  const nxtDays = randInt(2, 30);
  const nxtDate = futureDays(date, nxtDays);
  const arr     = randInt(15, 650);
  const contractType = pick(CONTRACT_TYPES);

  const actionItems: string[] = [];
  if (rand() > 0.25) actionItems.push(`Send updated renewal proposal to ${custId} (${company}) by ${futureDays(date, 2)}`);
  if (rand() > 0.35) actionItems.push(`Update account health score and renewal probability in CRM`);
  if (rand() > 0.45) actionItems.push(`Escalate ${tickRef ?? 'open incident'} to Tier-2 engineering — SLA breach risk`);
  if (rand() > 0.50) actionItems.push(`Schedule ${product} advanced features demo for ${futureDays(date, nxtDays)}`);
  if (rand() > 0.55) actionItems.push(`Prepare ${contractType} renewal quote — current ARR: $${arr}k`);
  if (rand() > 0.60) actionItems.push(`Coordinate with ${pick(['Customer Success','Solutions Engineering','Finance','Legal'])} for ${pick(['contract review','technical workshop','pricing approval','compliance sign-off'])}`);
  if (vendRef && rand() > 0.45) actionItems.push(`Review ${vendRef} dependency impact on ${company} SLA obligations`);
  if (projRef && rand() > 0.60) actionItems.push(`Update ${projRef} milestone tracker — customer impacted by ${topic}`);

  const competitorMention = rand() > 0.55
    ? `\nCompetitive Context: ${company} mentioned evaluating ${pick(['Salesforce CRM','HubSpot Enterprise','Zendesk Suite','Freshworks CRM','Monday.com','Dynamics 365'])} as a backup option. Primary concern: ${pick(['pricing','feature gap','support quality','migration complexity'])}.`
    : '';

  const expansionSignal = rand() > 0.6
    ? `\nExpansion Signal: Customer expressed interest in ${pick(['additional user seats','second product module','enterprise API package','dedicated CSM tier','professional services'])} — estimated upsell: $${randInt(8,120)}k ARR.`
    : '';

  const notes = [
    `Customer sentiment: ${sent.toLowerCase()}. Primary concern raised: ${pick(['platform stability','support response times','feature parity with competitors','integration reliability','pricing transparency','data security','compliance requirements'])}.`,
    `Rep ${rep} (${empId}) confirmed ${rand() > 0.5 ? 'successful resolution of' : 'active investigation into'} ${tickRef ? `ticket ${tickRef}` : 'the reported issue'}.`,
    rand() > 0.4 ? `Customer referenced ${pick(['Q1 board review','upcoming audit','go-live deadline','budget cycle','executive review'])} on ${futureDays(date, randInt(14,60))} as a driver for resolution urgency.` : '',
    rand() > 0.5 ? `Key technical topics discussed: ${pick(['SSO/SAML configuration','API rate limit increases','multi-region data residency','custom report building','webhook reliability','bulk data operations'])}.` : '',
    rand() > 0.6 ? `${company} mentioned ${randInt(5,300)} users affected and estimated business impact of $${randInt(2,50)}k/day during the current issue window.` : '',
  ].filter(Boolean).join(' ');

  return [
    `CRM Activity Log — ${rand() > 0.5 ? 'Inbound' : 'Outbound'} Call`,
    `Log ID:        ACT2-C-${pad(idx, 6)}`,
    `Date:          ${date} UTC`,
    `Customer:      ${custId} (${company})`,
    `Assigned Rep:  ${empId} (${rep})`,
    `Product:       ${product}`,
    `Contract Type: ${contractType}`,
    `Topic:         ${topic}`,
    `Duration:      ${dur} min`,
    `Sentiment:     ${sent}`,
    ``,
    `Call Summary:`,
    notes,
    competitorMention,
    expansionSignal,
    ``,
    `Action Items:`,
    ...actionItems.map(a => `  • ${a}`),
    ``,
    `Next Scheduled Contact: ${nxtDate}`,
    tickRef ? `Linked Ticket:    ${tickRef}` : '',
    vendRef ? `Vendor Reference: ${vendRef}` : '',
    projRef ? `Project Reference: ${projRef}` : '',
    `Logged by: ${empId} (${rep})`,
  ].filter(l => l !== undefined && l !== '').join('\n');
}

// ── Generator: EmailThread v2 ─────────────────────────────────────────────────
function genEmailThread(idx: number): string {
  const custId  = pick(CUST_IDS);
  const empId   = pick(EMP_IDS);
  const rep     = empName();
  const company = companyFor(custId);
  const product = pick(PRODUCTS);
  const subject = pick(TOPICS_EMAIL);
  const turns   = randInt(3, 7);
  const baseDate = randDate();
  const tickRef = rand() > 0.35 ? pick(TICK_IDS) : null;
  const vendRef = rand() > 0.6 ? pick(VEND_IDS) : null;
  const cc      = rand() > 0.5 ? `${pick(EMP_IDS)} (${pick(['CSM Lead','Solutions Architect','Account Director','Technical Lead'])})` : null;

  const header = [
    `Email Thread — Customer Communication`,
    `Thread ID:   ACT2-E-${pad(idx, 6)}`,
    `Subject:     ${subject}`,
    `Customer:    ${custId} (${company})`,
    `Rep:         ${empId} (${rep})`,
    cc ? `CC:          ${cc}` : '',
    `Product:     ${product}`,
    tickRef ? `Ticket Ref:  ${tickRef}` : '',
    vendRef ? `Vendor Ref:  ${vendRef}` : '',
    `Turns:       ${turns}`,
    ``,
  ].filter(l => l !== undefined && l !== '').join('\n');

  const messages: string[] = [];
  for (let t = 0; t < turns; t++) {
    const isCustomer = t % 2 === 0;
    const sender   = isCustomer ? `Customer (${custId} — ${company})` : `${empId} (${rep})`;
    const msgDate  = futureDays(baseDate, t);
    const hour     = randInt(8, 17);
    const msgTime  = `${msgDate} ${pad(hour, 2)}:${pad(randInt(0,59),2)}`;

    let body = '';
    if (isCustomer) {
      const urgency = pick(['urgent','high priority','blocking our team','impacting production','delaying our go-live']);
      const issues = [
        `We are currently experiencing ${pick(ISSUE_TYPES)} on ${product}. This is ${urgency} — approximately ${randInt(5,300)} users in our ${pick(['North America','EMEA','APAC'])} region are affected. The issue started around ${futureDays(baseDate, -randInt(0,3))} at approximately ${pad(randInt(8,17),2)}:${pad(randInt(0,59),2)} UTC.`,
        `Following up on ${tickRef ? `ticket ${tickRef}` : 'our previous discussion'}. We have a ${pick(['board meeting','compliance audit','product launch','executive review','contract renewal deadline'])} on ${futureDays(baseDate, randInt(7,21))} and require this resolved urgently. Can you provide a confirmed ETA?`,
        `Our technical team has reviewed the ${pick(['integration documentation','API changelog','release notes','security advisory'])} you sent. We have identified ${randInt(2,8)} open questions — specifically around ${pick(['data residency requirements','rate limit handling','authentication flow','error response formats','pagination behavior'])}. Please advise.`,
        `We are in the process of our annual security review and require the following documentation from ${pick(['your security team','your compliance team','TrustCenter'])}: ${pick(['SOC 2 Type II report','penetration test summary','data processing agreement','GDPR compliance attestation','vendor risk questionnaire responses'])}. Our deadline is ${futureDays(baseDate, randInt(10,30))}.`,
      ];
      body = pick(issues);
    } else {
      const responses = [
        `Thank you for the detailed report. I have escalated this to our ${pick(['platform reliability','security','integrations','data engineering'])} team and opened ${tickRef ? `ticket ${tickRef}` : `a P${randInt(1,2)} incident ticket`}. Our team has identified the root cause as ${pick(['a configuration drift introduced in the 2025-${pad(randInt(1,12),2)}-${pad(randInt(1,28),2)} deployment','a third-party dependency issue with ' + (vendRef ?? pick(VEND_IDS)),'a race condition in the session management layer','a cache invalidation issue triggered by the recent data volume spike'])}. Estimated resolution: ${futureDays(baseDate, randInt(1,5))}.`,
        `I appreciate your patience. Our engineering team has deployed a ${pick(['hotfix','configuration patch','rate limit adjustment','cache flush'])} to your tenant environment. Please confirm whether the issue is resolved from your end. If the problem persists, we will escalate to ${pick(['Tier-3 engineering','the platform reliability team','our CTO office','the dedicated incident bridge'])}.`,
        `I have prepared the requested documentation. Please find attached: (1) ${pick(['SOC 2 Type II report — valid through','penetration test executive summary — conducted','DPA v3.2 — effective','ISO 27001 certificate —'])} ${futureDays(baseDate, randInt(-90,30))}; (2) updated ${pick(['data processing agreement','vendor risk assessment','API changelog','SLA addendum'])}. Please review and let me know if you require any additional information from our ${pick(['legal','compliance','security','solutions engineering'])} team.`,
        `Following our discussion, I have updated your account with the ${pick(['expanded rate limits','dedicated support tier','custom SLA terms','multi-region configuration','additional user entitlements'])} as requested. The changes will take effect within ${randInt(1,24)} hours. I have also scheduled a technical check-in for ${futureDays(baseDate, randInt(3,14))} to confirm everything is working as expected.`,
      ];
      body = pick(responses);
    }

    messages.push(`[${msgTime}] ${sender}:\n${body}`);
  }

  const resolution = rand() > 0.35
    ? `\nThread Status: ${pick(['Resolved — customer confirmed','Pending customer response','Escalated — incident bridge open','Closed — follow-up scheduled for ' + futureDays(baseDate, randInt(7,21)),'Under review by engineering'])}\n`
    : '\n';

  return header + messages.join('\n\n---\n\n') + resolution;
}

// ── Generator: SupportNote v2 ─────────────────────────────────────────────────
function genSupportNote(idx: number): string {
  const custId   = pick(CUST_IDS);
  const empId    = pick(EMP_IDS);
  const analyst  = empName();
  const tickId   = pick(TICK_IDS);
  const product  = pick(PRODUCTS);
  const issue    = pick(ISSUE_TYPES);
  const date     = randDate();
  const priority = pick(['P1 — Critical','P2 — High','P2 — High','P3 — Medium','P3 — Medium','P4 — Low']);
  const vendRef  = rand() > 0.45 ? pick(VEND_IDS) : null;
  const affectedUsers = randInt(2, 1000);
  const slaHoursLeft  = randInt(0, 24);

  const rootCauses = [
    `Memory leak in ${product} worker process — heap size exceeded threshold after ${randInt(48,336)} hours of uptime.`,
    `Deadlock detected in database transaction layer during concurrent bulk operations exceeding ${randInt(50,500)} req/s.`,
    `TLS handshake failure caused by certificate CN mismatch — certificate renewed on ${futureDays(date, -randInt(1,14))} with incorrect SAN.`,
    `Webhook delivery failure traced to customer firewall rule blocking outbound HTTPS from IP range 34.0.0.0/8.`,
    `API rate limiter misconfiguration — customer's burst allowance was set at account level (${randInt(100,500)}/min) instead of per-endpoint.`,
    `Stale read replica serving ${randInt(10,40)}% of read traffic — replication lag reached ${randInt(30,900)} seconds during peak.`,
    `Breaking schema change in ${product} v${randInt(2,9)}.${randInt(0,9)}.${randInt(1,9)} affected customers on legacy data export format.`,
    vendRef ? `Vendor ${vendRef} upstream API introduced undocumented rate limit (${randInt(100,1000)}/hour) — our retry logic triggered cascading 429 errors.` : `Regional DNS propagation failure in ${pick(REGIONS)} — ${randInt(15,60)} minute impact window.`,
    `Session token signing key rotation not propagated to all pod replicas — ${randInt(5,30)}% of sessions invalidated unexpectedly.`,
    `Elasticsearch index shard imbalance — ${randInt(2,8)} shards allocated to single node causing ${pick(['query timeouts','OOM kills','slow log backlog'])}.`,
  ];

  const nextSteps = [
    `Deploy hotfix ${product}-${randInt(2,9)}.${randInt(0,9)}.${randInt(1,20)}-patch to customer tenant — ETA ${futureDays(date, 1)}.`,
    `Schedule emergency maintenance window with customer for ${futureDays(date, randInt(1,3))} at ${pad(randInt(0,6),2)}:00 UTC.`,
    `Engage vendor ${vendRef ?? pick(VEND_IDS)} escalation team — provide incident timeline and impact metrics.`,
    `Increase monitoring alert sensitivity for ${pick(['memory usage','API error rate','replication lag','queue depth'])} on ${custId} tenant.`,
    `Prepare post-incident report and SLA credit calculation for customer review by ${futureDays(date, 5)}.`,
  ];

  return [
    `Internal Support Note — Tier ${rand() > 0.4 ? '2' : '3'} Analysis`,
    `Note ID:        ACT2-N-${pad(idx, 6)}`,
    `Ticket:         ${tickId}`,
    `Date/Time:      ${date} UTC`,
    `Analyst:        ${empId} (${analyst})`,
    `Customer:       ${custId}`,
    `Product:        ${product}`,
    `Priority:       ${priority}`,
    `SLA Remaining:  ${slaHoursLeft} hours`,
    `Affected Users: ${affectedUsers}`,
    vendRef ? `Vendor Dep:     ${vendRef}` : '',
    ``,
    `Reported Issue:`,
    `  Customer reports ${issue} impacting ${affectedUsers} users in production.`,
    `  First observed: ${futureDays(date, -randInt(0,3))} — escalated to current tier at ${date}.`,
    ``,
    `Root Cause Analysis:`,
    `  ${pick(rootCauses)}`,
    rand() > 0.45 ? `  Contributing factor: ${pick(['recent customer config change','platform version rollout','vendor maintenance window','spike in data volume — ' + randInt(200,500) + '% above baseline'])} on ${futureDays(date, -randInt(1,7))}.` : '',
    ``,
    `Workaround Applied:`,
    `  ${pick([
      `Restarted affected ${product} microservice on customer tenant — ${randInt(80,100)}% of users restored.`,
      `Applied temporary rate limit increase (${randInt(500,5000)} req/min) — confirmed stable.`,
      `Switched ${randInt(10,50)}% of customer traffic to backup region ${pick(REGIONS)}.`,
      `Cleared stale cache layer — all ${affectedUsers} affected users re-authenticated successfully.`,
      `Rolled back ${product} to v${randInt(2,7)}.${randInt(0,9)}.${randInt(0,9)} on customer tenant — monitoring stable.`,
    ])}`,
    ``,
    `Next Steps:`,
    ...pick(nextSteps).split('\n').map(s => `  ${s}`),
    `  Engineering ticket: ENG-${randInt(10000, 99999)}`,
    ``,
    `Status: ${pick(['Workaround active — monitoring for 24h','Resolved — pending post-incident report','Escalated to engineering','Awaiting vendor response','Customer confirmation pending'])}`,
  ].filter(l => l !== undefined && l !== '').join('\n');
}

// ── Generator: AuditEntry v2 ──────────────────────────────────────────────────
function genAuditEntry(idx: number): string {
  const empId   = pick(EMP_IDS);
  const actor   = empName();
  const action  = pick(AUDIT_ACTIONS);
  const date    = randDate();
  const custId  = rand() > 0.3 ? pick(CUST_IDS) : null;
  const vendRef = rand() > 0.6 ? pick(VEND_IDS) : null;
  const region  = pick(REGIONS);
  const scope   = randInt(1, 10000);
  const approver = rand() > 0.4 ? `${pick(EMP_IDS)} (${pick(['System Admin','Compliance Officer','VP Engineering','CISO','Data Governance Lead'])})` : null;

  const resources: Record<string, string> = {
    RECORD_UPDATE: 'Customer Records',       BULK_EXPORT: 'CRM Data Export',
    USER_LOGIN: 'Authentication Service',    PERMISSION_CHANGE: 'RBAC Policy',
    DATA_DELETE: 'Archived Records',         RECORD_CREATE: 'Lead Records',
    ROLE_ASSIGN: 'User Management',          CONFIG_UPDATE: 'Tenant Configuration',
    BULK_IMPORT: 'Contact Records',          PASSWORD_RESET: 'Auth Credentials',
    API_KEY_ROTATE: 'API Key Store',         SESSION_EXPIRE: 'Session Registry',
    MFA_ENROLL: 'Multi-Factor Auth',         REPORT_GENERATE: 'Analytics Reports',
    WEBHOOK_CREATE: 'Webhook Registry',      INTEGRATION_ENABLE: 'Integration Catalog',
  };

  const details: Record<string, string> = {
    RECORD_UPDATE: `${scope} records updated — fields modified: ${pick(['email','phone','contract_value','account_status','assigned_rep','renewal_date'])}`,
    BULK_EXPORT: `${scope} records exported to ${pick(['S3 (us-east-1)','GCS (europe-west1)','Azure Blob (eastus)','SFTP (customer server)'])} — format: ${pick(['CSV','JSON','Parquet','XLSX'])}`,
    USER_LOGIN: `Authentication ${rand() > 0.08 ? 'succeeded' : 'failed — MFA challenge triggered; ' + randInt(1,3) + ' attempt(s)'}; session ID: sess_${Math.abs(seed & 0xffffff).toString(16)}`,
    PERMISSION_CHANGE: `Policy updated — "${pick(['read:reports','write:contacts','admin:billing','export:all','delete:archived'])}" permission ${pick(['granted to','revoked from','modified for'])} ${randInt(1,50)} users`,
    DATA_DELETE: `${scope} archived records purged — retention policy enforced: ${randInt(1,7)} years; compliance tag: ${pick(['GDPR-Art17','CCPA-1798.105','HIPAA-164.530'])}`,
    RECORD_CREATE: `${scope} new ${pick(['lead','contact','account','opportunity'])} records created — source: ${pick(['web form','CSV import','API','Salesforce sync','manual entry'])}`,
    ROLE_ASSIGN: `Role "${pick(['admin','viewer','editor','billing_manager','support_agent','read_only','data_analyst'])}" assigned to ${randInt(1,50)} users in ${custId ?? 'global'} tenant`,
    CONFIG_UPDATE: `${pick(['SSO SAML endpoint','webhook delivery URL','API rate limit','data retention period','session timeout','MFA policy','IP allowlist'])} updated for ${custId ?? 'platform'} tenant`,
    BULK_IMPORT: `${scope} records imported — ${randInt(0, Math.floor(scope * 0.03))} duplicates merged; ${randInt(0, Math.floor(scope * 0.01))} records rejected (validation error)`,
    PASSWORD_RESET: `Password reset initiated for ${randInt(1,20)} users — method: ${pick(['email link','admin override','SSO re-auth','TOTP reset'])}`,
    API_KEY_ROTATE: `API key rotated for ${custId ?? 'service account'} — previous key invalidated; new key TTL: ${pick(['90 days','180 days','1 year','no expiry'])}`,
    SESSION_EXPIRE: `${scope} idle sessions expired (timeout: ${randInt(30,240)} min) — region: ${region}`,
    MFA_ENROLL: `MFA enrollment completed for ${randInt(1,100)} users — method: ${pick(['TOTP','SMS','Email OTP','Hardware Key (FIDO2)','Push Notification'])}`,
    REPORT_GENERATE: `${pick(['Revenue summary','Churn analysis','Support ticket trends','SLA compliance','API usage'])} report generated — date range: ${futureDays(date, -90)} to ${date.split(' ')[0]}; rows: ${scope}`,
    WEBHOOK_CREATE: `New webhook endpoint registered: ${pick(['https://customer.io/hooks','https://zapier.com/hooks','https://n8n.io/webhook','https://slack.com/api/events'])} — events: ${pick(['ticket.created','contract.renewed','user.login','api.limit'])}`,
    INTEGRATION_ENABLE: `${pick(['Salesforce Sync','Jira Integration','Slack Notifications','Stripe Billing','Snowflake Connector','Datadog Monitoring'])} integration enabled for ${custId ?? 'global'} tenant`,
  };

  return [
    `Audit Log Entry`,
    `Entry ID:    AUD2-${pad(idx, 8)}`,
    `Timestamp:   ${date} UTC`,
    `Actor:       ${empId} (${actor})`,
    `Action:      ${action}`,
    `Resource:    ${resources[action] ?? 'System Resource'}`,
    custId ? `Customer:    ${custId}` : '',
    vendRef ? `Vendor:      ${vendRef}` : '',
    `Region:      ${region}`,
    `Session:     sess_${Math.abs(seed & 0xffffff).toString(16).padStart(8,'0')}`,
    `IP Address:  ${randInt(10,203)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`,
    `User Agent:  ${pick(['Mozilla/5.0 (Windows NT 10.0)','Mozilla/5.0 (Macintosh)','TigerGraph-SDK/2.0','curl/7.88.1','Postman/10.18'])}`,
    ``,
    `Action Details:`,
    `  ${details[action] ?? 'Operation completed successfully'}`,
    approver ? `  Approved by: ${approver}` : '',
    rand() > 0.45 ? `  Compliance tag: ${pick(['SOC2-CC6.1','GDPR-Art30','HIPAA-164.312','ISO27001-A.12.4','PCI-DSS-10.3','CCPA-1798.100'])}` : '',
    rand() > 0.6  ? `  Risk score: ${pick(['LOW','LOW','MEDIUM','MEDIUM','HIGH'])} — auto-flagged by ${rand() > 0.5 ? 'SIEM' : 'DLP policy'}` : '',
    ``,
    `Result:      ${rand() > 0.04 ? 'SUCCESS' : 'PARTIAL — see error log ENG-' + randInt(10000,99999) + '; retry scheduled'}`,
    `Retention:   ${randInt(1,7)} years (policy: ${pick(['GDPR-Standard','US-Federal','HIPAA-Covered','PCI-DSS-Req10'])})`,
  ].filter(l => l !== undefined && l !== '').join('\n');
}

// ── Generator: ContractNote (new type for v2) ─────────────────────────────────
function genContractNote(idx: number): string {
  const custId      = pick(CUST_IDS);
  const empId       = pick(EMP_IDS);
  const rep         = empName();
  const company     = companyFor(custId);
  const product     = pick(PRODUCTS);
  const date        = randDate();
  const contractType = pick(CONTRACT_TYPES);
  const arr         = randInt(12, 800);
  const term        = pick([12, 24, 36]);
  const renewalDate = futureDays(date, term * 30);
  const vendRef     = rand() > 0.6 ? pick(VEND_IDS) : null;

  const negotiationPoints = [
    `Customer requested ${randInt(5,20)}% discount on list price — approved up to ${randInt(3,15)}% subject to multi-year commitment.`,
    `Requested addition of ${pick(['disaster recovery SLA addendum','GDPR data processing agreement','custom MSA clause 14.3 override','unlimited user seats','dedicated infrastructure clause'])}.`,
    `Proposed payment terms: ${pick(['net-30','net-60','quarterly in advance','annual upfront with 2% discount','monthly with no discount'])}.`,
    `Customer flagged ${pick(['vendor lock-in concerns','data portability requirements','exit clause terms','audit rights','IP ownership clauses'])} as blocking items.`,
    `Legal team review required for ${pick(['Section 12.4 (liability cap)','Section 8.1 (data retention)','Section 15 (auto-renewal)','Exhibit B (SLA credits)','Schedule 2 (security requirements)'])}.`,
  ];

  const complianceReqs = rand() > 0.5
    ? `\nCompliance Requirements:\n  Customer requires: ${pick(['SOC 2 Type II attestation','ISO 27001 certificate','HIPAA BAA','GDPR DPA v3','PCI DSS ROC'])}\n  Status: ${pick(['Provided — accepted','Under review','Pending legal sign-off','Requested — 14 days remaining'])}`
    : '';

  return [
    `Contract & Renewal Note`,
    `Note ID:       ACT2-K-${pad(idx, 6)}`,
    `Date:          ${date} UTC`,
    `Rep:           ${empId} (${rep})`,
    `Customer:      ${custId} (${company})`,
    `Product:       ${product}`,
    `Contract Type: ${contractType}`,
    `Contract Term: ${term} months`,
    `Current ARR:   $${arr}k`,
    `Renewal Date:  ${renewalDate}`,
    vendRef ? `Primary Vendor Dep: ${vendRef}` : '',
    ``,
    `Negotiation Status: ${pick(['In progress','Legal review','Awaiting customer signature','Approved — pending countersign','Stalled — escalated to VP Sales'])}`,
    ``,
    `Open Negotiation Points:`,
    ...Array.from({ length: randInt(2,4) }, () => `  • ${pick(negotiationPoints)}`),
    complianceReqs,
    ``,
    `Next Action: ${pick(['Send revised proposal by','Schedule legal call for','Obtain VP approval by','Confirm with customer by'])} ${futureDays(date, randInt(2,14))}`,
    `Deal Risk: ${pick(['Low — strong champion','Medium — pricing sensitivity','High — competitor shortlist','Critical — renewal in jeopardy'])}`,
    `Logged by: ${empId} (${rep})`,
  ].filter(l => l !== undefined && l !== '').join('\n');
}

// ── Main: generate until TARGET_CHARS reached ─────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  Activity Log Generator v2 — 201M Token Dataset Filler');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Target: ${(TARGET_CHARS / 4_000_000).toFixed(0)}M tokens (~${TARGET_CHARS.toLocaleString()} chars)`);
console.log('');

if (!existsSync(join(__dirname, '../data'))) mkdirSync(join(__dirname, '../data'));

const lines: string[] = [];
let totalChars = 0;
let callIdx = 1, emailIdx = 1, noteIdx = 1, auditIdx = 1, contractIdx = 1;
const LOG_EVERY = 10000;

// 6 types — longer docs = fewer total files needed
const generators = [
  () => { const c = genCallLog(callIdx++);     return { id: `act2_call_ACT2-C-${pad(callIdx,6)}`,     content: c }; },
  () => { const c = genEmailThread(emailIdx++); return { id: `act2_email_ACT2-E-${pad(emailIdx,6)}`,  content: c }; },
  () => { const c = genSupportNote(noteIdx++);  return { id: `act2_note_ACT2-N-${pad(noteIdx,6)}`,    content: c }; },
  () => { const c = genAuditEntry(auditIdx++);  return { id: `act2_audit_AUD2-${pad(auditIdx,8)}`,    content: c }; },
  () => { const c = genContractNote(contractIdx++); return { id: `act2_contract_ACT2-K-${pad(contractIdx,6)}`, content: c }; },
  () => { const c = genCallLog(callIdx++);     return { id: `act2_call_ACT2-C-${pad(callIdx,6)}`,     content: c }; },
  () => { const c = genSupportNote(noteIdx++);  return { id: `act2_note_ACT2-N-${pad(noteIdx,6)}`,    content: c }; },
  () => { const c = genEmailThread(emailIdx++); return { id: `act2_email_ACT2-E-${pad(emailIdx,6)}`,  content: c }; },
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
    const pct  = ((totalChars / TARGET_CHARS) * 100).toFixed(1);
    const toks = (totalChars / 4_000_000).toFixed(1);
    process.stdout.write(`\r  ${docCount.toLocaleString()} docs | ${toks}M chars (${pct}%)`);
  }
}

console.log('');
writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8');

const newTokensM    = (totalChars / 4_000_000).toFixed(2);
const existingM     = 150;
const projectedM    = (existingM + parseFloat(newTokensM)).toFixed(1);

console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log(`  ✅ Generation complete!`);
console.log(`     Documents:   ${docCount.toLocaleString()}`);
console.log(`     Chars:       ${(totalChars / 1_000_000).toFixed(1)}M`);
console.log(`     New tokens:  ~${newTokensM}M`);
console.log(`     Total:       ~${projectedM}M tokens (was ${existingM}M)`);
console.log(`     Output:      data/activity_ingest_v2.jsonl`);
console.log('');
console.log('  Next: npx tsx scripts/ingest-activity-logs-v2.ts');
console.log('═══════════════════════════════════════════════════════');
