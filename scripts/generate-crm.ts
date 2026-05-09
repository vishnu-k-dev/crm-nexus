/**
 * Synthetic CRM Dataset Generator
 * Generates ~2.5M tokens of realistic company data across 6 entity types.
 * Outputs: data/crm/ with JSON entities + chunked documents for TigerGraph ingest.
 *
 * Entity graph:
 *   Department ←─ Employee ─→ Deal ─→ Customer
 *                    │                    │
 *                    └──→ Ticket ←────────┘
 *                              └──→ Product
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = './data/crm';
mkdirSync(OUT_DIR, { recursive: true });

// ── Seeded random ──────────────────────────────────────────────────────────────
let seed = 42;
function rand(): number { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(seed) / 0x80000000; }
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]!; }
function randInt(min: number, max: number): number { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min: number, max: number): number { return +(rand() * (max - min) + min).toFixed(2); }
function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }

// ── Reference data ─────────────────────────────────────────────────────────────
const FIRST_NAMES = ['James','Emily','Michael','Sarah','David','Jessica','Robert','Ashley','John','Amanda','William','Megan','Richard','Lauren','Thomas','Rachel','Charles','Hannah','Daniel','Stephanie','Matthew','Nicole','Anthony','Elizabeth','Mark','Heather','Donald','Amy','Steven','Melissa','Paul','Rebecca','Andrew','Christina','Kenneth','Andrea','Joshua','Jennifer','Kevin','Crystal','Brian','Michelle','George','Kelly','Timothy','Lisa','Ronald','Angela','Edward','Sandra','Jason','Laura','Jeffrey','Kimberly','Ryan','Donna','Jacob','Dorothy','Gary','Patricia','Nicholas','Linda','Eric','Barbara','Jonathan','Janet','Stephen','Maria','Larry','Deborah','Justin','Jessica','Scott','Betty','Brandon','Helen','Frank','Carol','Raymond','Ruth','Gregory','Sharon','Samuel','Diana','Benjamin','Anna','Patrick','Alice','Jack','Julie'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts','Turner','Phillips','Evans','Edwards','Collins','Stewart','Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper','Peterson','Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson','Watson','Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza','Ruiz','Hughes','Price','Alvarez','Castillo','Sanders','Patel','Myers','Long','Ross','Foster','Jimenez'];
const COMPANIES = ['Acme Corp','GlobalTech Solutions','Pinnacle Enterprises','Vertex Systems','Nexus Industries','Apex Dynamics','Quantum Holdings','Stellar Technologies','Horizon Group','Meridian Solutions','Catalyst Partners','Fusion Networks','Summit Analytics','Vanguard Systems','Prism Technologies','Eclipse Solutions','Zenith Innovations','Omega Group','Atlas Consulting','Solaris Enterprises','Titan Software','Phoenix Digital','Orion Technologies','Nebula Systems','Comet Analytics','Pulsar Dynamics','Aurora Innovations','Stratos Consulting','Helix Solutions','Praxis Group','Vortex Technologies','Nova Enterprises','Quasar Systems','Synapse Solutions','Matrix Innovations','Parallax Consulting','Helix Dynamics','Arclight Systems','Crest Technologies','Pivot Analytics','Ignite Solutions','Luminary Group','Keystone Enterprises','Fulcrum Technologies','Leverage Solutions','Momentum Systems','Traction Analytics','Velocity Group','Impact Innovations','Catalyst Consulting'];
const INDUSTRIES = ['Technology','Healthcare','Finance','Manufacturing','Retail','Education','Real Estate','Logistics','Energy','Telecommunications','Media','Hospitality','Automotive','Pharmaceutical','Insurance','Legal','Government','Non-profit','Agriculture','Construction'];
const COUNTRIES = ['United States','United Kingdom','Germany','France','Canada','Australia','India','Japan','Brazil','Netherlands','Sweden','Singapore','Spain','Italy','Mexico','Switzerland','Norway','Denmark','Finland','Belgium'];
const DEPARTMENTS = ['Sales','Engineering','Customer Success','Marketing','Finance','Human Resources','Operations','Product','Legal','Support'];
const ROLES: Record<string, string[]> = {
  'Sales': ['Sales Representative','Senior Sales Executive','Account Executive','Enterprise Sales Manager','Sales Director'],
  'Engineering': ['Software Engineer','Senior Engineer','Tech Lead','Engineering Manager','Principal Engineer'],
  'Customer Success': ['Customer Success Manager','Senior CSM','CS Team Lead','Director of Customer Success','VP Customer Success'],
  'Marketing': ['Marketing Analyst','Content Manager','Growth Manager','Marketing Director','CMO'],
  'Finance': ['Financial Analyst','Senior Analyst','Finance Manager','CFO','Controller'],
  'Human Resources': ['HR Generalist','Recruiter','HR Manager','HRBP','VP People'],
  'Operations': ['Operations Analyst','Operations Manager','Director of Operations','COO','Process Engineer'],
  'Product': ['Product Manager','Senior PM','Group PM','Director of Product','VP Product'],
  'Legal': ['Legal Counsel','Senior Counsel','Legal Manager','General Counsel'],
  'Support': ['Support Engineer','Senior Support','Support Lead','Support Manager','Director of Support'],
};
const PRODUCTS = [
  { name: 'CRM Pro', category: 'Software', basePrice: 299, description: 'Full-featured CRM platform for mid-market teams. Includes pipeline management, contact tracking, email automation, and 50+ integrations. Supports up to 100 users per workspace.', features: ['Pipeline management','Email automation','Contact scoring','Workflow builder','API access','Custom dashboards','Mobile app','Salesforce sync'] },
  { name: 'CRM Enterprise', category: 'Software', basePrice: 899, description: 'Enterprise-grade CRM with advanced analytics, AI-powered lead scoring, unlimited users, dedicated support, SSO, and custom SLA agreements. Includes quarterly business reviews.', features: ['Unlimited users','AI lead scoring','Custom SLA','SSO/SAML','Dedicated CSM','Advanced analytics','Custom integrations','On-premise option'] },
  { name: 'Analytics Suite', category: 'Analytics', basePrice: 499, description: 'Real-time business intelligence platform with drag-and-drop dashboards, predictive analytics, and automated reporting. Connects to 100+ data sources.', features: ['Real-time dashboards','Predictive models','Automated reports','100+ connectors','Data warehouse sync','Collaboration tools'] },
  { name: 'Support Desk', category: 'Support', basePrice: 149, description: 'Omnichannel customer support platform with ticketing, live chat, knowledge base, and SLA management. AI-assisted response suggestions reduce handle time by 40%.', features: ['Omnichannel inbox','AI suggestions','SLA management','Knowledge base','CSAT surveys','Ticket automation'] },
  { name: 'Marketing Hub', category: 'Marketing', basePrice: 349, description: 'All-in-one marketing automation platform with email campaigns, landing pages, A/B testing, lead nurturing workflows, and attribution reporting.', features: ['Email campaigns','Landing pages','A/B testing','Lead nurturing','Attribution reporting','Social scheduling'] },
  { name: 'Sales Intelligence', category: 'Data', basePrice: 199, description: 'B2B data enrichment and intent data platform. Auto-enrich leads with company firmographics, technographics, and buying intent signals. Updated daily.', features: ['Auto-enrichment','Intent signals','Firmographics','Technographics','CSV import','CRM sync'] },
  { name: 'Field Service', category: 'Operations', basePrice: 249, description: 'Mobile-first field service management software for scheduling, dispatching, and tracking field technicians. GPS tracking, digital work orders, and inventory management.', features: ['Mobile app','GPS tracking','Digital work orders','Scheduling','Inventory','Customer portal'] },
  { name: 'Revenue Intelligence', category: 'Analytics', basePrice: 599, description: 'AI-powered revenue forecasting and deal intelligence platform. Analyzes call recordings, emails, and CRM data to identify at-risk deals and coaching opportunities.', features: ['AI forecasting','Deal health scores','Call analysis','Email tracking','Coaching insights','Pipeline alerts'] },
];
const DEAL_STAGES = ['Prospecting','Qualification','Proposal','Negotiation','Closed Won','Closed Lost'];
const TICKET_PRIORITIES = ['Low','Medium','High','Critical'];
const TICKET_STATUSES = ['Open','In Progress','Pending','Resolved','Closed'];
const TICKET_CATEGORIES = ['Billing','Technical','Feature Request','Onboarding','Integration','Performance','Security','Account Management','Training','Other'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fullName() { return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`; }
function email(name: string, domain: string): string { return `${name.toLowerCase().replace(' ', '.')}@${domain.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`; }
function isoDate(year: number, month: number, day: number): string { return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`; }
function randDate(startYear = 2020, endYear = 2024): string {
  const y = randInt(startYear, endYear);
  const m = randInt(1, 12);
  const d = randInt(1, 28);
  return isoDate(y, m, d);
}

// ── 1. Departments ─────────────────────────────────────────────────────────────
console.log('Generating departments...');
const departments = DEPARTMENTS.map((name, i) => ({
  id: `dept_${i + 1}`,
  name,
  description: `The ${name} department is responsible for ${
    name === 'Sales' ? 'driving revenue growth through new customer acquisition, upselling existing accounts, and managing the full sales cycle from prospecting to close' :
    name === 'Engineering' ? 'designing, building, and maintaining product infrastructure, features, and integrations across web, mobile, and API surfaces' :
    name === 'Customer Success' ? 'ensuring customer retention, adoption, and satisfaction through proactive outreach, health monitoring, and strategic account management' :
    name === 'Marketing' ? 'generating demand, building brand awareness, and nurturing leads through campaigns, content, events, and digital channels' :
    name === 'Finance' ? 'managing company financials including budgeting, forecasting, reporting, accounts receivable, and investor relations' :
    name === 'Human Resources' ? 'recruiting top talent, managing employee lifecycle, benefits administration, culture initiatives, and compliance' :
    name === 'Operations' ? 'optimizing business processes, managing vendor relationships, facilities, and ensuring operational efficiency across the company' :
    name === 'Product' ? 'defining product strategy, prioritizing roadmap, working with engineering and customers to ship features that drive value' :
    name === 'Legal' ? 'managing contracts, compliance, intellectual property, employment law, and corporate governance matters' :
    'providing technical and product support to customers through multiple channels including email, phone, and live chat'
  }.`,
  head: '',       // filled in later
  budget_usd: randInt(500_000, 5_000_000),
  headcount_target: randInt(10, 80),
  q4_goal: name === 'Sales' ? `$${randInt(5, 25)}M ARR` : name === 'Engineering' ? `Ship ${randInt(3, 8)} major features` : `${randInt(85, 98)}% target achievement`,
}));

// ── 2. Employees ───────────────────────────────────────────────────────────────
console.log('Generating employees...');
const employees: Record<string, unknown>[] = [];
const empIds: string[] = [];
for (let i = 1; i <= 300; i++) {
  const dept = pick(departments);
  const roleList = ROLES[dept.name] ?? ['Analyst'];
  const role = pick(roleList);
  const name = fullName();
  const hireYear = randInt(2018, 2023);
  const hireMonth = randInt(1, 12);
  const skills = shuffle(['CRM','Salesforce','HubSpot','SQL','Python','Excel','Tableau','PowerPoint','Negotiation','Account Management','Cold Calling','Pipeline Management','Data Analysis','Customer Success','Onboarding','Technical Support','API Integration','Project Management','Agile','Scrum']).slice(0, randInt(3, 7));
  const emp = {
    id: `emp_${i}`,
    name,
    email: email(name, 'acmecorp'),
    department_id: dept.id,
    department_name: dept.name,
    role,
    hire_date: isoDate(hireYear, hireMonth, randInt(1, 28)),
    years_at_company: 2024 - hireYear,
    salary_band: role.includes('Director') || role.includes('VP') || role.includes('Chief') ? 'L6' : role.includes('Senior') || role.includes('Lead') || role.includes('Manager') ? 'L4-L5' : 'L2-L3',
    skills,
    quota_usd: dept.name === 'Sales' ? randInt(500_000, 2_000_000) : null,
    quota_attainment_pct: dept.name === 'Sales' ? randInt(60, 140) : null,
    performance_rating: pick(['Exceeds Expectations','Meets Expectations','Meets Expectations','Partially Meets','Outstanding']),
    manager_id: '',  // filled below
    location: pick(COUNTRIES),
    bio: `${name} is a ${role} in the ${dept.name} department with ${2024 - hireYear} year${2024 - hireYear !== 1 ? 's' : ''} of tenure at Acme Corp. ${
      dept.name === 'Sales'
        ? `Specializes in ${pick(['enterprise', 'mid-market', 'SMB'])} sales with a focus on ${pick(INDUSTRIES)} verticals. Known for ${pick(['strong discovery skills', 'exceptional follow-up', 'technical acumen', 'relationship building', 'deal negotiation'])} and ${pick(['consistently exceeds quota', 'strong pipeline hygiene', 'high win rates against competition', 'large average deal sizes'])}.`
        : dept.name === 'Engineering'
        ? `Focuses on ${pick(['backend', 'frontend', 'full-stack', 'infrastructure', 'data'])} development. Core expertise in ${skills.slice(0, 2).join(' and ')}. ${pick(['Key contributor to the core platform', 'Leads the integration team', 'Owns the API layer', 'Drives architectural decisions'])}.`
        : dept.name === 'Customer Success'
        ? `Manages a portfolio of ${randInt(15, 50)} accounts totaling $${randInt(1, 10)}M ARR. Specializes in ${pick(['enterprise', 'mid-market', 'strategic'])} accounts in the ${pick(INDUSTRIES)} sector. ${pick(['Achieved 98% retention last year', 'Drove $500K in expansion revenue', 'Reduced churn by 15%', 'Launched customer advisory board'])}.`
        : `Brings ${randInt(3, 15)} years of industry experience. ${pick(['Recently led a major initiative that improved team efficiency by 25%', 'Drove key process improvements across the organization', 'Manages cross-functional projects with multiple stakeholders', 'Instrumental in the company\'s recent growth phase'])}.`
    } Skills: ${skills.join(', ')}.`,
  };
  employees.push(emp);
  empIds.push(emp.id);
}
// Assign managers
for (const emp of employees) {
  const deptEmps = employees.filter(e => e.department_id === emp.department_id && e.id !== emp.id);
  const mgrs = deptEmps.filter(e => (e.role as string).includes('Manager') || (e.role as string).includes('Director') || (e.role as string).includes('VP'));
  (emp as Record<string,unknown>).manager_id = mgrs.length ? pick(mgrs).id as string : '';
}
// Set dept heads
for (const dept of departments) {
  const deptEmps = employees.filter(e => e.department_id === dept.id);
  const senior = deptEmps.find(e => (e.role as string).includes('Director') || (e.role as string).includes('VP')) ?? deptEmps[0];
  if (senior) dept.head = senior.id as string;
}

// ── 3. Customers ───────────────────────────────────────────────────────────────
console.log('Generating customers...');
const customers: Record<string, unknown>[] = [];
for (let i = 1; i <= 1000; i++) {
  const company = i <= COMPANIES.length ? COMPANIES[i - 1]! : `${pick(COMPANIES).split(' ')[0]} ${pick(['Technologies','Solutions','Group','Partners','Systems','Ventures','Digital','Global','International','Holdings'])} ${i}`;
  const industry = pick(INDUSTRIES);
  const country = pick(COUNTRIES);
  const employees_count = pick([25, 50, 100, 200, 500, 1000, 5000, 10000]);
  const arr = randInt(10_000, 2_000_000);
  const segment = arr > 500_000 ? 'Enterprise' : arr > 100_000 ? 'Mid-Market' : 'SMB';
  const healthScore = randInt(20, 100);
  const contact = fullName();
  const cust = {
    id: `cust_${i}`,
    company_name: company,
    industry,
    country,
    segment,
    employee_count: employees_count,
    arr_usd: arr,
    health_score: healthScore,
    health_label: healthScore >= 75 ? 'Healthy' : healthScore >= 50 ? 'At Risk' : 'Critical',
    primary_contact: contact,
    primary_contact_email: email(contact, company),
    primary_contact_title: pick(['CEO','CTO','VP Sales','VP Operations','IT Director','Head of Engineering','COO','Founder','Director of IT','CIO']),
    customer_since: randDate(2019, 2023),
    renewal_date: randDate(2024, 2026),
    products_subscribed: shuffle(PRODUCTS.map(p => p.name)).slice(0, randInt(1, 3)),
    account_manager_id: pick(empIds),
    csm_id: pick(empIds),
    nps_score: randInt(1, 10),
    last_qbr_date: randDate(2023, 2024),
    notes: `${company} is a ${segment} account in the ${industry} sector based in ${country}. They have approximately ${employees_count.toLocaleString()} employees and generate $${(arr / 1000).toFixed(0)}K in annual recurring revenue. ${
      healthScore >= 75
        ? `Account is healthy with strong adoption and recent expansion. Primary contact ${contact} is a champion and has referred two new prospects this quarter.`
        : healthScore >= 50
        ? `Account shows some risk signals including ${pick(['declining login activity', 'open support tickets unresolved >14 days', 'missed QBR last quarter', 'champion job change', 'budget freeze mentioned'])}. CSM has initiated re-engagement outreach.`
        : `Account is at critical risk. ${pick(['Champion left the company', 'Competitor evaluation in progress', 'Budget cut mentioned by finance team', 'Multiple unresolved escalations', 'NPS score dropped to 2 last quarter'])}. Executive sponsor outreach scheduled.`
    } Key use case: ${pick(['sales pipeline management', 'customer onboarding automation', 'support ticket routing', 'revenue forecasting', 'marketing campaign tracking', 'field service scheduling', 'partner relationship management'])}.`,
  };
  customers.push(cust);
}

// ── 4. Deals ──────────────────────────────────────────────────────────────────
console.log('Generating deals...');
const deals: Record<string, unknown>[] = [];
for (let i = 1; i <= 5000; i++) {
  const customer = pick(customers) as Record<string, unknown>;
  const owner = pick(employees.filter(e => e.department_name === 'Sales')) as Record<string, unknown>;
  const product = pick(PRODUCTS);
  const stage = pick(DEAL_STAGES);
  const seats = randInt(5, 500);
  const value = Math.round(product.basePrice * seats * randFloat(0.7, 1.4) / 100) * 100;
  const closeDate = randDate(2023, 2025);
  const closeMonth = parseInt(closeDate.split('-')[1]!) ;
  const closeYear = parseInt(closeDate.split('-')[0]!);
  const quarter = `Q${Math.ceil(closeMonth / 3)} ${closeYear}`;
  const competitorNames = ['Salesforce','HubSpot','Pipedrive','Monday.com','Zoho','Freshsales','Close','Copper'];
  const hasCompetitor = rand() > 0.4;
  const competitor = hasCompetitor ? pick(competitorNames) : null;
  const deal = {
    id: `deal_${i}`,
    title: `${customer.company_name} — ${product.name} ${stage === 'Closed Won' || stage === 'Closed Lost' ? '' : 'Opportunity'}`.trim(),
    customer_id: customer.id,
    customer_name: customer.company_name,
    owner_id: owner.id,
    owner_name: owner.name,
    department_id: owner.department_id,
    product_id: `prod_${PRODUCTS.indexOf(product) + 1}`,
    product_name: product.name,
    product_category: product.category,
    stage,
    value_usd: value,
    seats,
    close_date: closeDate,
    quarter,
    industry: customer.industry,
    country: customer.country,
    segment: customer.segment,
    competitor: competitor,
    won: stage === 'Closed Won',
    lost: stage === 'Closed Lost',
    notes: `Deal for ${customer.company_name} to adopt ${product.name} (${seats} seats, $${value.toLocaleString()}). ${
      stage === 'Closed Won' ? `Successfully closed in ${MONTHS[closeMonth - 1]} ${closeYear}. ${pick(['Champion was VP Sales', 'Decision driven by ROI analysis', 'Displaced competitor after POC', 'Referral from existing customer', 'Executive sponsor aligned early'])}. Implementation scheduled for next quarter.` :
      stage === 'Closed Lost' ? `Lost to ${competitor ?? 'no decision'} in ${MONTHS[closeMonth - 1]} ${closeYear}. ${pick(['Pricing was main objection', 'Competitor had better integration with existing stack', 'Internal champion left', 'Budget cut', 'Project deprioritized'])}. Post-mortem completed.` :
      stage === 'Negotiation' ? `In final negotiation phase. ${pick(['Legal reviewing MSA', 'Security review in progress', 'Procurement approval pending', 'Board sign-off required for deal above $500K'])}. ${competitor ? `Competing against ${competitor}.` : 'No active competition.'}` :
      stage === 'Proposal' ? `Proposal sent ${randInt(5, 30)} days ago. ${pick(['Demo completed last week', 'POC running successfully', 'Technical validation done', 'Champion is aligned'])}. Waiting on ${pick(['procurement review', 'finance approval', 'technical sign-off', 'executive review'])}.` :
      `Early stage opportunity. ${pick(['Discovery call completed', 'Initial demo scheduled', 'Inbound from marketing campaign', 'Outbound SDR sourced', 'Partner referral'])}. Next step: ${pick(['technical deep-dive', 'stakeholder mapping', 'send ROI analysis', 'schedule VP-level meeting'])}.`
    }`,
  };
  deals.push(deal);
}

// ── 5. Tickets ────────────────────────────────────────────────────────────────
console.log('Generating tickets...');
const tickets: Record<string, unknown>[] = [];
const supportEmps = employees.filter(e => e.department_name === 'Support' || e.department_name === 'Engineering');
for (let i = 1; i <= 15000; i++) {
  const customer = pick(customers) as Record<string, unknown>;
  const assignee = pick(supportEmps) as Record<string, unknown>;
  const priority = pick(TICKET_PRIORITIES);
  const status = pick(TICKET_STATUSES);
  const category = pick(TICKET_CATEGORIES);
  const createdDate = randDate(2023, 2024);
  const resolvedDate = (status === 'Resolved' || status === 'Closed') ? randDate(2023, 2024) : null;
  const ticket = {
    id: `ticket_${i}`,
    title: `[${category}] ${pick([
      'Unable to sync contacts with Salesforce','API rate limit errors in production','Billing discrepancy on invoice #' + randInt(1000,9999),'Need help setting up SSO with Okta','Dashboard loading slowly for large datasets','Workflow automation not triggering correctly','CSV import failing for records with special characters','Custom field not appearing in reports','Webhook not sending data to Zapier','User permissions not working as expected','Data export missing columns','Email templates not rendering in Outlook','Mobile app crashes on startup','Duplicate contact records being created','Forecast numbers incorrect for Q' + randInt(1,4),'Need training session for new team members','Integration with Slack not posting notifications','Report date filters not working correctly','Account settings changes not saving','Two-factor authentication login issues',
    ])}`,
    customer_id: customer.id,
    customer_name: customer.company_name,
    assignee_id: assignee.id,
    assignee_name: assignee.name,
    department_id: assignee.department_id,
    priority,
    status,
    category,
    created_date: createdDate,
    resolved_date: resolvedDate,
    resolution_time_hrs: resolvedDate ? randInt(1, 240) : null,
    csat_score: (status === 'Resolved' || status === 'Closed') ? randInt(1, 5) : null,
    product_affected: pick(PRODUCTS).name,
    description: `Customer ${customer.company_name} reported: ${pick([
      `We are experiencing ${pick(['intermittent', 'consistent', 'critical', 'occasional'])} issues with ${pick(['the API integration', 'data synchronization', 'user authentication', 'report generation', 'the mobile application', 'email notifications', 'the dashboard', 'bulk imports'])}. This ${pick(['started after', 'began following', 'occurred after'])} ${pick(['the latest update', 'a configuration change', 'adding new users', 'migrating data', 'connecting a new integration'])}. The issue ${pick(['affects all users', 'affects only admin users', 'occurs in production only', 'happens intermittently', 'blocks our team from completing daily tasks'])}. We have already tried ${pick(['clearing cache', 'restarting the application', 'reverting settings', 'creating a new account', 'contacting our IT team'])} but the issue persists.`,
      `This is a ${priority.toLowerCase()} priority issue affecting our ${pick(['sales team', 'support team', 'entire organization', 'executive team', 'finance department'])}. We need ${pick(['immediate assistance', 'a fix by end of week', 'a workaround while the issue is investigated', 'to understand the root cause', 'an update on the timeline'])}. Business impact: ${pick(['unable to process daily reports', 'blocking $' + randInt(10, 500) + 'K deal from closing', 'customer-facing outage', 'team productivity reduced by 50%', 'compliance deadline at risk'])}.`,
    ])} ${pick(['Please prioritize this issue.', 'Happy to jump on a call.', 'Need resolution by EOD.', 'Escalating if not resolved by tomorrow.', 'Team is blocked until this is fixed.'])}`,
  };
  tickets.push(ticket);
}

// ── 6. Products ───────────────────────────────────────────────────────────────
console.log('Generating products...');
const products = PRODUCTS.map((p, i) => ({
  id: `prod_${i + 1}`,
  ...p,
  pricing_model: pick(['Per Seat/Month','Flat Rate/Month','Usage Based','Annual Contract']),
  annual_revenue_usd: randInt(1_000_000, 20_000_000),
  active_customers: randInt(200, 2000),
  nps: randInt(30, 70),
  competitors: shuffle(['Salesforce','HubSpot','Zendesk','Intercom','Marketo','Pipedrive','Freshdesk','Monday.com','Notion','Airtable']).slice(0, 3),
  roadmap_q4: `${pick(['Launch', 'Release', 'Ship', 'Deliver'])} ${pick(['AI-powered', 'native', 'enhanced', 'redesigned'])} ${pick(['reporting', 'mobile app', 'integrations', 'onboarding flow', 'analytics dashboard', 'notification system', 'API v2', 'bulk operations'])}.`,
}));

// ── Save JSON ─────────────────────────────────────────────────────────────────
console.log('Saving entity JSON files...');
writeFileSync(join(OUT_DIR, 'departments.json'), JSON.stringify(departments, null, 2));
writeFileSync(join(OUT_DIR, 'employees.json'),   JSON.stringify(employees,   null, 2));
writeFileSync(join(OUT_DIR, 'customers.json'),   JSON.stringify(customers,   null, 2));
writeFileSync(join(OUT_DIR, 'deals.json'),       JSON.stringify(deals,       null, 2));
writeFileSync(join(OUT_DIR, 'tickets.json'),     JSON.stringify(tickets,     null, 2));
writeFileSync(join(OUT_DIR, 'products.json'),    JSON.stringify(products,    null, 2));

// ── Convert to chunked documents for TigerGraph ingest ────────────────────────
console.log('Creating chunked documents for TigerGraph...');
const chunks: Array<{ id: string; source_type: string; source_id: string; text: string; metadata: Record<string,unknown> }> = [];

function addChunk(sourceType: string, sourceId: string, text: string, meta: Record<string,unknown> = {}) {
  const id = `${sourceType}_${sourceId}_chunk_${chunks.filter(c => c.source_id === sourceId).length}`;
  chunks.push({ id, source_type: sourceType, source_id: sourceId, text: text.trim(), metadata: { ...meta, source_type: sourceType, source_id: sourceId } });
}

for (const dept of departments) {
  addChunk('department', dept.id, `Department: ${dept.name}\nDescription: ${dept.description}\nBudget: $${dept.budget_usd.toLocaleString()}\nHeadcount Target: ${dept.headcount_target}\nQ4 Goal: ${dept.q4_goal}`, { department_name: dept.name });
}

for (const emp of employees as Array<Record<string,unknown>>) {
  addChunk('employee', emp.id as string, `Employee: ${emp.name}\nRole: ${emp.role}\nDepartment: ${emp.department_name}\nEmail: ${emp.email}\nHire Date: ${emp.hire_date}\nYears at Company: ${emp.years_at_company}\nLocation: ${emp.location}\nSalary Band: ${emp.salary_band}\nPerformance Rating: ${emp.performance_rating}\nSkills: ${(emp.skills as string[]).join(', ')}\n${emp.quota_usd ? `Annual Quota: $${(emp.quota_usd as number).toLocaleString()}\nQuota Attainment: ${emp.quota_attainment_pct}%\n` : ''}Bio: ${emp.bio}`,
    { department_id: emp.department_id, department_name: emp.department_name, role: emp.role, location: emp.location });
}

for (const cust of customers as Array<Record<string,unknown>>) {
  addChunk('customer', cust.id as string, `Customer: ${cust.company_name}\nIndustry: ${cust.industry}\nCountry: ${cust.country}\nSegment: ${cust.segment}\nEmployees: ${(cust.employee_count as number).toLocaleString()}\nARR: $${(cust.arr_usd as number).toLocaleString()}\nHealth Score: ${cust.health_score}/100 (${cust.health_label})\nPrimary Contact: ${cust.primary_contact} (${cust.primary_contact_title})\nProducts: ${(cust.products_subscribed as string[]).join(', ')}\nNPS Score: ${cust.nps_score}/10\nCustomer Since: ${cust.customer_since}\nRenewal Date: ${cust.renewal_date}\nNotes: ${cust.notes}`,
    { industry: cust.industry, country: cust.country, segment: cust.segment, health_label: cust.health_label });
}

for (const deal of deals as Array<Record<string,unknown>>) {
  addChunk('deal', deal.id as string, `Deal: ${deal.title}\nCustomer: ${deal.customer_name}\nOwner: ${deal.owner_name}\nProduct: ${deal.product_name} (${deal.product_category})\nStage: ${deal.stage}\nValue: $${(deal.value_usd as number).toLocaleString()}\nSeats: ${deal.seats}\nClose Date: ${deal.close_date}\nQuarter: ${deal.quarter}\nIndustry: ${deal.industry}\nCountry: ${deal.country}\nSegment: ${deal.segment}\n${deal.competitor ? `Competitor: ${deal.competitor}\n` : ''}Notes: ${deal.notes}`,
    { stage: deal.stage, product_name: deal.product_name, industry: deal.industry, quarter: deal.quarter, won: deal.won, lost: deal.lost, segment: deal.segment });
}

for (const ticket of tickets as Array<Record<string,unknown>>) {
  addChunk('ticket', ticket.id as string, `Ticket: ${ticket.title}\nCustomer: ${ticket.customer_name}\nAssignee: ${ticket.assignee_name}\nPriority: ${ticket.priority}\nStatus: ${ticket.status}\nCategory: ${ticket.category}\nProduct Affected: ${ticket.product_affected}\nCreated: ${ticket.created_date}\n${ticket.resolved_date ? `Resolved: ${ticket.resolved_date}\nResolution Time: ${ticket.resolution_time_hrs} hours\n` : ''}${ticket.csat_score ? `CSAT Score: ${ticket.csat_score}/5\n` : ''}Description: ${ticket.description}`,
    { priority: ticket.priority, status: ticket.status, category: ticket.category, product_affected: ticket.product_affected });
}

for (const product of products) {
  addChunk('product', product.id, `Product: ${product.name}\nCategory: ${product.category}\nBase Price: $${product.basePrice}/seat/month\nPricing Model: ${product.pricing_model}\nAnnual Revenue: $${product.annual_revenue_usd.toLocaleString()}\nActive Customers: ${product.active_customers}\nNPS: ${product.nps}\nDescription: ${product.description}\nKey Features: ${product.features.join(', ')}\nCompetitors: ${product.competitors.join(', ')}\nQ4 Roadmap: ${product.roadmap_q4}`,
    { category: product.category });
}

writeFileSync(join(OUT_DIR, 'chunks.jsonl'), chunks.map(c => JSON.stringify(c)).join('\n'));

// ── Token estimate ─────────────────────────────────────────────────────────────
const totalChars = chunks.reduce((s, c) => s + c.text.length, 0);
const estTokens  = Math.round(totalChars / 4);
console.log(`\n✅ Generated ${chunks.length} chunks across ${totalChars.toLocaleString()} chars (~${(estTokens / 1_000_000).toFixed(2)}M tokens)`);
console.log(`   Departments : ${departments.length}`);
console.log(`   Employees   : ${employees.length}`);
console.log(`   Customers   : ${customers.length}`);
console.log(`   Deals       : ${deals.length}`);
console.log(`   Tickets     : ${tickets.length}`);
console.log(`   Products    : ${products.length}`);
console.log(`\nOutput: ${OUT_DIR}/`);

// ── Eval questions (multi-hop, requires graph traversal) ──────────────────────
console.log('\nGenerating eval questions...');

// Compute answers from generated data for ground truth
const wonDeals = (deals as Array<Record<string,unknown>>).filter(d => d.won);
const lostDeals = (deals as Array<Record<string,unknown>>).filter(d => d.lost);
const resolvedTickets = (tickets as Array<Record<string,unknown>>).filter(t => t.status === 'Resolved' || t.status === 'Closed');
const criticalTickets = (tickets as Array<Record<string,unknown>>).filter(t => t.priority === 'Critical');
const enterpriseCustomers = (customers as Array<Record<string,unknown>>).filter(c => c.segment === 'Enterprise');
const criticalAccounts = (customers as Array<Record<string,unknown>>).filter(c => c.health_label === 'Critical');
const salesEmps = employees.filter(e => e.department_name === 'Sales') as Array<Record<string,unknown>>;

// Top sales rep by won deal value
const repRevMap: Record<string, number> = {};
for (const d of wonDeals) { repRevMap[d.owner_id as string] = (repRevMap[d.owner_id as string] ?? 0) + (d.value_usd as number); }
const topRepId = Object.entries(repRevMap).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
const topRep = employees.find(e => e.id === topRepId) as Record<string,unknown> | undefined;

// Top industry by won deal count
const industryWins: Record<string,number> = {};
for (const d of wonDeals) { industryWins[d.industry as string] = (industryWins[d.industry as string] ?? 0) + 1; }
const topIndustry = Object.entries(industryWins).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '';

// Most common ticket category
const catCount: Record<string,number> = {};
for (const t of tickets as Array<Record<string,unknown>>) { catCount[t.category as string] = (catCount[t.category as string] ?? 0) + 1; }
const topCategory = Object.entries(catCount).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '';

// Product with most open critical tickets
const prodCritMap: Record<string,number> = {};
for (const t of criticalTickets.filter(t => t.status === 'Open' || t.status === 'In Progress')) {
  prodCritMap[t.product_affected as string] = (prodCritMap[t.product_affected as string] ?? 0) + 1;
}
const topCritProduct = Object.entries(prodCritMap).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '';

// Best department by win rate
const deptWins: Record<string,{wins:number,total:number}> = {};
for (const d of deals as Array<Record<string,unknown>>) {
  if (!deptWins[d.department_id as string]) deptWins[d.department_id as string] = {wins:0,total:0};
  deptWins[d.department_id as string]!.total++;
  if (d.won) deptWins[d.department_id as string]!.wins++;
}

const evalQuestions = [
  {
    question: "Who is the top-performing sales representative by total closed-won deal revenue?",
    answer: topRep ? `${topRep.name} is the top-performing sales representative with the highest total closed-won deal revenue, working in the ${topRep.department_name} department with the role of ${topRep.role}.` : "Information not available.",
    type: "multi-hop",
    hops: 2,
    entities: ["Employee", "Deal"],
    description: "Requires aggregating Deal.value_usd by Deal.owner_id, then fetching Employee details."
  },
  {
    question: "Which industry has the most closed-won deals in our CRM?",
    answer: `The ${topIndustry} industry has the most closed-won deals in the CRM.`,
    type: "multi-hop",
    hops: 2,
    entities: ["Deal", "Customer"],
    description: "Requires grouping deals by industry and counting wins."
  },
  {
    question: "What is the most common support ticket category raised by customers?",
    answer: `The most common support ticket category is ${topCategory}.`,
    type: "simple",
    hops: 1,
    entities: ["Ticket"],
    description: "Aggregates ticket category counts."
  },
  {
    question: "Which product has the most open critical-priority support tickets?",
    answer: `${topCritProduct} has the most open critical-priority support tickets, indicating it requires immediate engineering and support attention.`,
    type: "multi-hop",
    hops: 2,
    entities: ["Ticket", "Product"],
    description: "Filters tickets by priority=Critical and status=Open, groups by product."
  },
  {
    question: "How many customers are classified as 'Critical' health score and what segment do most of them belong to?",
    answer: `There are ${criticalAccounts.length} customers classified as Critical health score. ${
      (() => { const seg:Record<string,number>={}; for(const c of criticalAccounts){seg[c.segment as string]=(seg[c.segment as string]??0)+1;} const top=Object.entries(seg).sort((a,b)=>b[1]-a[1])[0]; return top ? `Most of them are in the ${top[0]} segment (${top[1]} accounts).` : ''; })()
    }`,
    type: "multi-hop",
    hops: 2,
    entities: ["Customer", "Deal"],
    description: "Filters customers by health_label, groups by segment."
  },
  {
    question: "Which department has the highest number of employees and what is their Q4 goal?",
    answer: (() => {
      const deptEmpCount: Record<string,number> = {};
      for (const e of employees) deptEmpCount[e.department_name as string] = (deptEmpCount[e.department_name as string] ?? 0) + 1;
      const topDeptName = Object.entries(deptEmpCount).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '';
      const topDept = departments.find(d => d.name === topDeptName);
      return topDept ? `The ${topDept.name} department has the most employees. Their Q4 goal is: ${topDept.q4_goal}.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Department", "Employee"],
    description: "Counts employees per department, then fetches department Q4 goal."
  },
  {
    question: "Which sales employee has the highest quota attainment percentage and what is their role?",
    answer: (() => {
      const top = salesEmps.filter(e => e.quota_attainment_pct != null).sort((a,b) => (b.quota_attainment_pct as number) - (a.quota_attainment_pct as number))[0];
      return top ? `${top.name} has the highest quota attainment at ${top.quota_attainment_pct}%, serving as ${top.role} in the Sales department.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Employee", "Department"],
    description: "Filters employees by department=Sales, ranks by quota_attainment_pct."
  },
  {
    question: "What are the top 3 products by number of active customers?",
    answer: `The top 3 products by active customers are: ${products.sort((a,b)=>b.active_customers-a.active_customers).slice(0,3).map(p=>`${p.name} (${p.active_customers} customers)`).join(', ')}.`,
    type: "simple",
    hops: 1,
    entities: ["Product"],
    description: "Ranks products by active_customers field."
  },
  {
    question: "Which country has the highest total value of closed-won deals?",
    answer: (() => {
      const countryVal:Record<string,number>={};
      for(const d of wonDeals){countryVal[d.country as string]=(countryVal[d.country as string]??0)+(d.value_usd as number);}
      const top=Object.entries(countryVal).sort((a,b)=>b[1]-a[1])[0];
      return top ? `${top[0]} has the highest total closed-won deal value at $${top[1].toLocaleString()}.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 3,
    entities: ["Deal", "Customer", "Employee"],
    description: "Groups won deals by country, sums value. Country comes from Customer entity."
  },
  {
    question: "How many Enterprise segment customers have a health score below 50?",
    answer: (() => {
      const n = (customers as Array<Record<string,unknown>>).filter(c => c.segment === 'Enterprise' && (c.health_score as number) < 50).length;
      return `There are ${n} Enterprise segment customers with a health score below 50, indicating they are at critical risk and require immediate attention from Customer Success.`;
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Customer", "Deal"],
    description: "Filters customers by segment=Enterprise AND health_score<50."
  },
  {
    question: "Which support ticket category has the best average CSAT score?",
    answer: (() => {
      const catCsat:Record<string,{sum:number,n:number}>={};
      for(const t of resolvedTickets.filter(t=>t.csat_score!=null)){
        const cat=t.category as string;
        if(!catCsat[cat]) catCsat[cat]={sum:0,n:0};
        catCsat[cat]!.sum+=(t.csat_score as number);
        catCsat[cat]!.n++;
      }
      const sorted=Object.entries(catCsat).filter(([,v])=>v.n>=5).sort((a,b)=>(b[1].sum/b[1].n)-(a[1].sum/a[1].n));
      const top=sorted[0];
      return top ? `The ${top[0]} category has the best average CSAT score of ${(top[1].sum/top[1].n).toFixed(2)}/5 among resolved tickets.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Ticket", "Customer"],
    description: "Groups resolved tickets by category, averages CSAT score."
  },
  {
    question: "What is the total pipeline value of deals currently in Negotiation stage?",
    answer: (() => {
      const total=(deals as Array<Record<string,unknown>>).filter(d=>d.stage==='Negotiation').reduce((s,d)=>s+(d.value_usd as number),0);
      const count=(deals as Array<Record<string,unknown>>).filter(d=>d.stage==='Negotiation').length;
      return `There are ${count} deals in the Negotiation stage with a total pipeline value of $${total.toLocaleString()}.`;
    })(),
    type: "simple",
    hops: 1,
    entities: ["Deal"],
    description: "Filters deals by stage=Negotiation and sums value."
  },
  {
    question: "Which employee has resolved the most support tickets?",
    answer: (() => {
      const empTickets:Record<string,number>={};
      for(const t of resolvedTickets){empTickets[t.assignee_id as string]=(empTickets[t.assignee_id as string]??0)+1;}
      const topId=Object.entries(empTickets).sort((a,b)=>b[1]-a[1])[0]?.[0]??'';
      const emp=employees.find(e=>e.id===topId) as Record<string,unknown>|undefined;
      const count=empTickets[topId]??0;
      return emp ? `${emp.name} has resolved the most support tickets (${count} tickets), working as ${emp.role} in the ${emp.department_name} department.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Employee", "Ticket"],
    description: "Aggregates resolved tickets by assignee_id, then fetches employee details."
  },
  {
    question: "What percentage of deals involving the CRM Enterprise product were closed won?",
    answer: (() => {
      const enterpriseDeals=(deals as Array<Record<string,unknown>>).filter(d=>d.product_name==='CRM Enterprise');
      const wins=enterpriseDeals.filter(d=>d.won).length;
      const pct=enterpriseDeals.length ? (wins/enterpriseDeals.length*100).toFixed(1) : 0;
      return `${pct}% of CRM Enterprise deals (${wins} out of ${enterpriseDeals.length}) were closed won.`;
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Deal", "Product"],
    description: "Filters deals by product_name, computes win rate."
  },
  {
    question: "Which customer segment generates the highest average deal value?",
    answer: (() => {
      const segVal:Record<string,{sum:number,n:number}>={};
      for(const d of wonDeals){
        const seg=d.segment as string;
        if(!segVal[seg]) segVal[seg]={sum:0,n:0};
        segVal[seg]!.sum+=(d.value_usd as number);
        segVal[seg]!.n++;
      }
      const sorted=Object.entries(segVal).sort((a,b)=>(b[1].sum/b[1].n)-(a[1].sum/a[1].n));
      const top=sorted[0];
      return top ? `The ${top[0]} segment generates the highest average deal value of $${Math.round(top[1].sum/top[1].n).toLocaleString()} per closed-won deal.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 3,
    entities: ["Deal", "Customer", "Product"],
    description: "Groups won deals by segment, computes average value. Segment comes from Customer."
  },
  {
    question: "How many employees in the Engineering department have been at the company for more than 3 years?",
    answer: (() => {
      const n=employees.filter(e=>e.department_name==='Engineering'&&(e.years_at_company as number)>3).length;
      return `${n} employees in the Engineering department have been at Acme Corp for more than 3 years.`;
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Employee", "Department"],
    description: "Filters employees by department and tenure."
  },
  {
    question: "What is the most common competitor mentioned in lost deals?",
    answer: (() => {
      const compCount:Record<string,number>={};
      for(const d of lostDeals.filter(d=>d.competitor)){compCount[d.competitor as string]=(compCount[d.competitor as string]??0)+1;}
      const top=Object.entries(compCount).sort((a,b)=>b[1]-a[1])[0];
      return top ? `${top[0]} is the most common competitor in lost deals, appearing in ${top[1]} lost opportunities.` : 'No competitors recorded in lost deals.';
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Deal", "Customer"],
    description: "Filters lost deals, groups by competitor field."
  },
  {
    question: "Which product category has the highest total annual revenue?",
    answer: (() => {
      const catRev:Record<string,number>={};
      for(const p of products){catRev[p.category]=(catRev[p.category]??0)+p.annual_revenue_usd;}
      const top=Object.entries(catRev).sort((a,b)=>b[1]-a[1])[0];
      return top ? `The ${top[0]} category has the highest total annual revenue at $${top[1].toLocaleString()}.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Product"],
    description: "Groups products by category, sums annual_revenue_usd."
  },
  {
    question: "Which department handles the most support tickets?",
    answer: (() => {
      const deptTickets:Record<string,number>={};
      for(const t of tickets as Array<Record<string,unknown>>){deptTickets[t.department_id as string]=(deptTickets[t.department_id as string]??0)+1;}
      const topId=Object.entries(deptTickets).sort((a,b)=>b[1]-a[1])[0]?.[0]??'';
      const dept=departments.find(d=>d.id===topId);
      return dept ? `The ${dept.name} department handles the most support tickets.` : 'N/A';
    })(),
    type: "multi-hop",
    hops: 2,
    entities: ["Ticket", "Employee", "Department"],
    description: "Groups tickets by assignee department — requires Ticket→Employee→Department traversal."
  },
  {
    question: "What is the average resolution time (in hours) for Critical priority tickets?",
    answer: (() => {
      const crit=resolvedTickets.filter(t=>t.priority==='Critical'&&t.resolution_time_hrs!=null);
      const avg=crit.length ? Math.round(crit.reduce((s,t)=>s+(t.resolution_time_hrs as number),0)/crit.length) : 0;
      return `The average resolution time for Critical priority tickets is ${avg} hours (${(avg/24).toFixed(1)} days).`;
    })(),
    type: "multi-hop",
    hops: 1,
    entities: ["Ticket"],
    description: "Filters tickets by priority=Critical and status=Resolved, averages resolution_time_hrs."
  },
];

writeFileSync(join(OUT_DIR, 'eval_questions.json'), JSON.stringify(evalQuestions, null, 2));
console.log(`✅ Generated ${evalQuestions.length} eval questions`);
console.log('\n🎉 CRM dataset generation complete!');
console.log('Next: npx tsx scripts/ingest-crm.ts  — to load into TigerGraph');
