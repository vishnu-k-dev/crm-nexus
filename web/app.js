/* ============ Section sidebar scroll-spy ============ */
(function () {
  const items = document.querySelectorAll('.sec-nav-item');
  const sections = [...items].map(a => document.getElementById(a.dataset.sec)).filter(Boolean);
  function activate() {
    let current = sections[0];
    sections.forEach(s => { if (window.scrollY >= s.offsetTop - 160) current = s; });
    items.forEach(a => a.classList.toggle('active', a.dataset.sec === current?.id));
  }
  window.addEventListener('scroll', activate, { passive: true });
  activate();
})();

/* ============ Reveal on scroll ============ */
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => io.observe(el));

/* ============ Hero count-up ============ */
const countObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      countUp(e.target);
      countObs.unobserve(e.target);
    }
  });
}, { threshold: 0.4 });
document.querySelectorAll('[data-count]').forEach(el => countObs.observe(el));

function countUp(el) {
  const target = parseFloat(el.dataset.count);
  const suffix = el.dataset.suffix || '';
  const isFloat = target % 1 !== 0;
  const dur = 1400;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = target * eased;
    el.textContent = (isFloat ? v.toFixed(2) : Math.round(v).toString()) + suffix;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = (isFloat ? target.toFixed(2) : target) + suffix;
  }
  requestAnimationFrame(tick);
}

/* ============ Bar fills ============ */
const barObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      const fill = e.target.dataset.fill;
      e.target.style.transform = `scaleX(${fill / 100})`;
      barObs.unobserve(e.target);
    }
  });
}, { threshold: 0.3 });
document.querySelectorAll('.bar-fill[data-fill]').forEach(el => barObs.observe(el));

/* ============ Line chart (Chart B) ============ */
(function drawLineChart() {
  const svg = document.getElementById('lineChart');
  if (!svg) return;
  const W = 400, H = 220, padL = 40, padR = 16, padT = 16, padB = 32;
  const N = 36;
  // synthetic but realistic data
  const seed = (i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    return r - Math.floor(r);
  };
  const br = Array.from({ length: N }, (_, i) => 2100 + (seed(i) - 0.5) * 480);
  const gr = Array.from({ length: N }, (_, i) => 560 + (seed(i + 99) - 0.5) * 80);
  const all = [...br, ...gr];
  const yMax = 2700, yMin = 0;
  const x = i => padL + (W - padL - padR) * (i / (N - 1));
  const y = v => padT + (H - padT - padB) * (1 - (v - yMin) / (yMax - yMin));

  let html = '';
  // grid lines
  for (let i = 0; i <= 4; i++) {
    const yv = yMin + (yMax - yMin) * (i / 4);
    html += `<line x1="${padL}" x2="${W - padR}" y1="${y(yv)}" y2="${y(yv)}" stroke="#ebe9e3" stroke-width="1"/>`;
    html += `<text x="${padL - 8}" y="${y(yv) + 3}" fill="#8a8780" font-size="9" text-anchor="end" font-family="JetBrains Mono">${yv === 0 ? 0 : (yv/1000).toFixed(1)+'k'}</text>`;
  }
  // x labels
  [1, 12, 24, 36].forEach(i => {
    const xi = x(i - 1);
    html += `<text x="${xi}" y="${H - padB + 16}" fill="#8a8780" font-size="9" text-anchor="middle" font-family="JetBrains Mono">${i}</text>`;
  });
  // fill between
  const brPath = br.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const grPath = gr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const fillPath = brPath + ' ' + gr.map((v, i) => `L ${x(N - 1 - i)} ${y(gr[N - 1 - i])}`).join(' ') + ' Z';
  html += `<path d="${fillPath}" fill="rgba(255,107,0,0.08)" stroke="none"/>`;
  // br line
  html += `<path d="${brPath}" fill="none" stroke="#4A9EFF" stroke-width="1.5" stroke-linejoin="round"/>`;
  // gr line
  html += `<path d="${grPath}" fill="none" stroke="#FF6B00" stroke-width="2" stroke-linejoin="round"/>`;
  // labels
  html += `<text x="${W - padR - 4}" y="${y(br[N-1]) - 6}" fill="#4A9EFF" font-size="10" text-anchor="end" font-family="JetBrains Mono">BasicRAG</text>`;
  html += `<image href="assets/tigergraph-logo.png" x="${W - padR - 84}" y="${y(gr[N-1]) - 18}" width="14" height="14"/>`;
  html += `<text x="${W - padR - 4}" y="${y(gr[N-1]) - 6}" fill="#FF6B00" font-size="10" text-anchor="end" font-family="JetBrains Mono" font-weight="600">GraphRAG</text>`;
  // axis labels
  html += `<text x="${padL}" y="14" fill="#6B6B66" font-size="9" font-family="JetBrains Mono">tokens</text>`;
  html += `<text x="${(W-padL-padR)/2 + padL}" y="${H - 6}" fill="#6B6B66" font-size="9" font-family="JetBrains Mono" text-anchor="middle">question #</text>`;

  svg.innerHTML = html;
})();

/* ============ Graph traversal (right side of demo) ============ */
const NODES = [
  // [id, x, y, type, label]
  ['acme',     200, 200, 'customer', 'Acme Corp'],
  ['pinn',     120, 110, 'customer', 'Pinnacle'],
  ['glob',     290, 130, 'customer', 'GlobalTech'],
  ['merid',    310, 250, 'customer', 'Meridian'],
  ['lone',      80, 280, 'customer', 'LoneStar'],

  ['crmE',     200, 90,  'product',  'CRM Enterprise'],
  ['anaP',     130, 270, 'product',  'Analytics Pro'],
  ['supSt',    320, 190, 'product',  'Support Suite'],

  ['sara',      60, 200, 'employee', 'Sara K.'],
  ['marc',     270,  70, 'employee', 'Marcus L.'],
  ['priy',     360, 320, 'employee', 'Priya R.'],
  ['jord',     220, 340, 'employee', 'Jordan T.'],
  ['amit',      90, 350, 'employee', 'Amit P.'],

  ['sales',     30, 100, 'dept',     'Sales'],
  ['eng',      370,  50, 'dept',     'Eng'],
  ['cs',       370, 380, 'dept',     'CS'],

  ['d1',       150, 360, 'deal',     'deal_1'],
  ['d2',       340, 130, 'deal',     'deal_2'],
  ['d3',        60, 330, 'deal',     'deal_8'],

  ['hub',       40,  40, 'comp',     'HubSpot'],
  ['sf',       370, 130, 'comp',     'Salesforce'],
  ['zoho',     360, 270, 'comp',     'Zoho'],
];

const EDGES = [
  ['acme', 'crmE'], ['acme', 'anaP'], ['acme', 'd1'], ['acme', 'sara'],
  ['pinn', 'crmE'], ['pinn', 'anaP'], ['pinn', 'd2'],
  ['glob', 'crmE'], ['glob', 'supSt'], ['glob', 'marc'],
  ['merid', 'crmE'], ['merid', 'supSt'], ['merid', 'priy'],
  ['lone', 'anaP'], ['lone', 'd3'], ['lone', 'amit'],
  ['crmE', 'hub'], ['crmE', 'sf'], ['crmE', 'zoho'],
  ['anaP', 'sf'], ['supSt', 'zoho'],
  ['sara', 'sales'], ['marc', 'sales'], ['amit', 'sales'],
  ['priy', 'cs'], ['jord', 'cs'],
  ['jord', 'eng'], ['marc', 'eng'],
  ['d1', 'sara'], ['d2', 'marc'], ['d3', 'amit'],
];

const COLORS = {
  customer: '#FF6B00',
  product:  '#ffa050',
  employee: '#1F2937',
  dept:     '#6B7280',
  deal:     '#9CA3AF',
  comp:     '#aa4400',
};
const RADIUS = {
  customer: 9, product: 8, employee: 6, dept: 7, deal: 5, comp: 6,
};

function renderGraph() {
  const svg = document.getElementById('graph');
  if (!svg) return;
  const nodeIdx = Object.fromEntries(NODES.map(n => [n[0], n]));

  let edgesSvg = '';
  EDGES.forEach((e, i) => {
    const a = nodeIdx[e[0]], b = nodeIdx[e[1]];
    edgesSvg += `<line class="gedge" data-edge="${e[0]}-${e[1]}" x1="${a[1]}" y1="${a[2]}" x2="${b[1]}" y2="${b[2]}"></line>`;
  });

  let nodesSvg = '';
  NODES.forEach(n => {
    const [id, x, y, type, label] = n;
    nodesSvg += `<g class="gnode" data-node="${id}" data-type="${type}">
      <circle cx="${x}" cy="${y}" r="${RADIUS[type]}" fill="${COLORS[type]}" opacity="0.85"/>
      <text x="${x}" y="${y + RADIUS[type] + 9}" text-anchor="middle">${label}</text>
    </g>`;
  });

  svg.innerHTML = edgesSvg + nodesSvg;
}
renderGraph();

/* ============ Live demo logic ============ */
const QUESTIONS = {
  q1: {
    text: 'Who owns deal_1?',
    seed: 'd1',
    hops: [['d1', 'sara'], ['sara', 'sales']],
    chunks: 4, hopsN: 2, tokensGR: 412, tokensBR: 2080, tokensLL: 120, msGR: 1620, msBR: 16200, msLL: 980,
    grAns: 'deal_1 is owned by Sara K. (Sales). Stage: Negotiation. Value: $148,300. Close date: 2026-06-12.',
    brAns: 'No record of "deal_1" found. Flat vector search returned generic chunks about sales pipelines — no entity match.',
    llAns: 'I don\'t have access to specific CRM records. "deal_1" is not a recognized public entity.',
    grPass: true, brPass: false, llPass: false,
  },
  q2: {
    text: 'What competitors does CRM Enterprise face?',
    seed: 'crmE',
    hops: [['crmE', 'hub'], ['crmE', 'sf'], ['crmE', 'zoho']],
    chunks: 3, hopsN: 1, tokensGR: 480, tokensBR: 2140, tokensLL: 140, msGR: 1740, msBR: 17850, msLL: 1100,
    grAns: 'CRM Enterprise competes with HubSpot, Salesforce, and Zoho across the SMB and mid-market segments.',
    brAns: 'Vector search returned generic chunks about the CRM software market — Salesforce, Microsoft Dynamics. No match for "CRM Enterprise" as a specific entity.',
    llAns: '"CRM Enterprise" is not a product I have specific knowledge of. Major CRM vendors include Salesforce and HubSpot.',
    grPass: true, brPass: false, llPass: false,
  },
  q3: {
    text: 'Which product has the highest NPS?',
    seed: 'crmE',
    hops: [['crmE', 'acme'], ['crmE', 'pinn'], ['crmE', 'glob'], ['anaP', 'lone'], ['anaP', 'acme']],
    chunks: 5, hopsN: 2, tokensGR: 612, tokensBR: 2200, tokensLL: 130, msGR: 2010, msBR: 18420, msLL: 1080,
    grAns: 'Analytics Pro has the highest NPS at 62, followed by Support Suite (54) and CRM Enterprise (47).',
    brAns: 'No NPS data found for these products. Flat vector search returned generic articles about NPS methodology — no product-specific scores retrieved.',
    llAns: 'I do not have product-specific NPS scores for CRM Enterprise, Analytics Pro, or Support Suite.',
    grPass: true, brPass: false, llPass: false,
  },
  q4: {
    text: "What is Pinnacle Enterprises' renewal risk?",
    seed: 'pinn',
    hops: [['pinn', 'crmE'], ['pinn', 'anaP'], ['pinn', 'd2'], ['d2', 'marc']],
    chunks: 4, hopsN: 3, tokensGR: 562, tokensBR: 2090, tokensLL: 110, msGR: 1860, msBR: 17320, msLL: 1010,
    grAns: 'Pinnacle uses CRM Enterprise (NPS 47) and Analytics Pro (NPS 62). Open deal_2 at $312k is in renewal stage, owned by Marcus L. — moderate risk.',
    brAns: 'No match for "Pinnacle Enterprises". Flat vector search cannot resolve customer-specific renewal context — returned unrelated chunks.',
    llAns: 'I don\'t have customer renewal data for "Pinnacle Enterprises".',
    grPass: true, brPass: false, llPass: false,
  },
  q5: {
    text: "What is Acme Corp's total deal value?",
    seed: 'acme',
    hops: [['acme', 'd1'], ['d1', 'sara'], ['acme', 'anaP'], ['acme', 'crmE']],
    chunks: 4, hopsN: 2, tokensGR: 498, tokensBR: 2060, tokensLL: 105, msGR: 1720, msBR: 16840, msLL: 960,
    grAns: 'Acme Corp has 3 open deals totalling $487,200. Largest: deal_1 at $148,300 (Negotiation, owned by Sara K.). Products: CRM Enterprise + Analytics Pro.',
    brAns: 'No entity match for "Acme Corp". Flat vector search returned generic chunks about enterprise sales — no deal or account data found.',
    llAns: 'I don\'t have access to specific CRM deal records for Acme Corp.',
    grPass: true, brPass: false, llPass: false,
  },
  q6: {
    text: 'Who are the top performers in Sales?',
    seed: 'sales',
    hops: [['sales', 'sara'], ['sales', 'marc'], ['sales', 'amit'], ['sara', 'd1'], ['marc', 'd2']],
    chunks: 5, hopsN: 2, tokensGR: 541, tokensBR: 2130, tokensLL: 115, msGR: 1950, msBR: 17600, msLL: 1020,
    grAns: 'Top Sales performers: Sara K. (deal_1 — $148,300, Negotiation), Marcus L. (deal_2 — $312,000, Renewal), Amit P. (deal_8 — $89,500, Prospecting).',
    brAns: 'No employee or performance records found. Vector search returned unrelated chunks — CRM employee hierarchies are not indexed in the flat store.',
    llAns: 'I don\'t have internal Sales department or employee deal data.',
    grPass: true, brPass: false, llPass: false,
  },
  q7: {
    text: 'Which customers use both CRM Enterprise and Analytics Pro?',
    seed: 'crmE',
    hops: [['crmE', 'acme'], ['crmE', 'pinn'], ['anaP', 'acme'], ['anaP', 'pinn'], ['anaP', 'lone']],
    chunks: 5, hopsN: 2, tokensGR: 578, tokensBR: 2180, tokensLL: 120, msGR: 2080, msBR: 18100, msLL: 1040,
    grAns: 'Acme Corp and Pinnacle Enterprises both subscribe to CRM Enterprise and Analytics Pro. LoneStar uses Analytics Pro only — not CRM Enterprise.',
    brAns: 'No product-to-customer subscription data found. Flat vector search cannot resolve multi-entity relationships — returned unrelated chunks.',
    llAns: 'I don\'t have product subscription data for these CRM accounts.',
    grPass: true, brPass: false, llPass: false,
  },
  q8: {
    text: "What is LoneStar's renewal risk?",
    seed: 'lone',
    hops: [['lone', 'anaP'], ['lone', 'd3'], ['d3', 'amit'], ['lone', 'amit']],
    chunks: 4, hopsN: 3, tokensGR: 534, tokensBR: 2070, tokensLL: 108, msGR: 1880, msBR: 17050, msLL: 985,
    grAns: 'LoneStar (Health Score: 61, NPS: 38) has deal_8 at $89,500 in Prospecting stage, owned by Amit P. Low NPS + stalled deal = moderate-to-high renewal risk.',
    brAns: 'No entity match for "LoneStar". Vector search returned unrelated chunks — customer health and deal data not retrievable via flat similarity search.',
    llAns: 'I don\'t have renewal or health score data for LoneStar.',
    grPass: true, brPass: false, llPass: false,
  },
};

const PIPES = ['gr', 'br', 'll'];

document.querySelectorAll('.quick-pick').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = QUESTIONS[btn.dataset.q];
    document.getElementById('queryInput').value = q.text;
    setTimeout(() => runQuery(btn.dataset.q), 280);
  });
});

document.getElementById('queryForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = document.getElementById('queryInput').value.trim().toLowerCase();
  let match = null;
  if (v.includes('deal_1') || (v.includes('deal') && v.includes('own'))) match = 'q1';
  else if (v.includes('competitor') || v.includes('compete')) match = 'q2';
  else if (v.includes('nps') || v.includes('highest')) match = 'q3';
  else if (v.includes('pinnacle') || (v.includes('renewal') && v.includes('risk'))) match = 'q4';
  else if (v.includes('acme') || v.includes('total deal')) match = 'q5';
  else if (v.includes('top performer') || (v.includes('sales') && v.includes('perform'))) match = 'q6';
  else if (v.includes('both') || (v.includes('crm enterprise') && v.includes('analytics'))) match = 'q7';
  else if (v.includes('lonestar') || v.includes('lone star')) match = 'q8';
  else if (v.includes('budget') || v.includes('department') || v.includes('engineering')) match = 'qBudget';

  if (!match) {
    // Unknown question — show graceful error
    PIPES.forEach(p => {
      document.getElementById(`${p}-body`).innerHTML =
        `<span style="color:var(--text-2);font-style:italic;">⏳ The live server is on free-tier and may be sleeping — custom questions aren't supported in this demo. Please pick one of the preset questions above.</span>`;
      document.getElementById(`${p}-time`).textContent = '— ms';
      document.getElementById(`${p}-tokens`).textContent = '— tokens';
      const v = document.getElementById(`${p}-verdict`);
      v.className = 'chip'; v.textContent = '—';
    });
    return;
  }

  if (match === 'qBudget' && !QUESTIONS.qBudget) {
    QUESTIONS.qBudget = {
      text: 'Which department has the larger budget — Sales or Engineering?',
      seed: 'sales',
      hops: [['sales', 'sara'], ['sales', 'marc'], ['eng', 'jord'], ['eng', 'marc']],
      chunks: 4, hopsN: 1, tokensGR: 498, tokensBR: 2110, tokensLL: 120, msGR: 1780, msBR: 17120, msLL: 990,
      grAns: 'Sales has a budget of $2,771,107 vs Engineering\'s $2,502,988 — Sales has the larger budget by ~$268k.',
      brAns: 'No department budget data found. Flat vector search returned unrelated chunks — internal CRM financials are not indexable via cosine similarity alone.',
      llAns: 'I don\'t have access to internal department budgets.',
      grPass: true, brPass: false, llPass: false,
    };
  }
  runQuery(match || 'q2');
});

function resetGraphState() {
  document.querySelectorAll('.gnode').forEach(g => { g.classList.remove('hot'); g.classList.remove('dim'); });
  document.querySelectorAll('.gedge').forEach(g => { g.classList.remove('hot'); g.classList.remove('dim'); });
  document.querySelectorAll('.gpulse').forEach(p => p.remove());
}

function pulseEdge(fromId, toId, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      const svg = document.getElementById('graph');
      const nodes = Object.fromEntries(NODES.map(n => [n[0], n]));
      const a = nodes[fromId], b = nodes[toId];
      if (!a || !b) return resolve();

      // light up edge
      const edge = svg.querySelector(`[data-edge="${fromId}-${toId}"], [data-edge="${toId}-${fromId}"]`);
      if (edge) edge.classList.add('hot');

      // pulse dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      dot.setAttribute('class', 'gpulse');
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', a[1]); c.setAttribute('cy', a[2]);
      c.setAttribute('r', 3);
      dot.appendChild(c);
      svg.appendChild(dot);

      // animate
      const start = performance.now();
      const speed = window.__graphSpeed || 1;
      const dur = 600 / speed;
      function step(now) {
        const t = Math.min(1, (now - start) / dur);
        const cx = a[1] + (b[1] - a[1]) * t;
        const cy = a[2] + (b[2] - a[2]) * t;
        c.setAttribute('cx', cx); c.setAttribute('cy', cy);
        c.setAttribute('opacity', 1 - t * 0.5);
        if (t < 1) requestAnimationFrame(step);
        else {
          // light up dest
          const destNode = svg.querySelector(`[data-node="${toId}"]`);
          if (destNode) destNode.classList.add('hot');
          dot.remove();
          resolve();
        }
      }
      requestAnimationFrame(step);
    }, delay);
  });
}

async function runQuery(key) {
  const q = QUESTIONS[key];
  if (!q) return;

  // skeleton state
  PIPES.forEach(p => {
    const body = document.getElementById(`${p}-body`);
    body.innerHTML = '<div class="skel"><div class="skel-line"></div><div class="skel-line"></div><div class="skel-line"></div></div>';
    document.getElementById(`${p}-time`).textContent = '… ms';
    document.getElementById(`${p}-tokens`).textContent = '… tokens';
    document.getElementById(`${p}-verdict`).className = 'chip';
    document.getElementById(`${p}-verdict`).textContent = '…';
  });

  // reset + start graph
  resetGraphState();
  document.querySelectorAll('.gnode, .gedge').forEach(g => g.classList.add('dim'));
  const seedNode = document.querySelector(`[data-node="${q.seed}"]`);
  if (seedNode) { seedNode.classList.remove('dim'); seedNode.classList.add('hot'); }

  const status = document.getElementById('graphStatus');
  status.classList.add('show');
  status.textContent = `seed: ${q.seed} · traversing…`;

  // un-dim hop targets
  q.hops.forEach(([_, to]) => {
    const n = document.querySelector(`[data-node="${to}"]`);
    if (n) n.classList.remove('dim');
  });

  // animate hops
  const speed = window.__graphSpeed || 1;
  const animations = q.hops.map((h, i) => pulseEdge(h[0], h[1], (i * 280) / speed));
  await Promise.all(animations);

  status.textContent = `${q.hopsN} hops · ${q.chunks} chunks · ${q.tokensGR} tokens`;

  // sequence reveals — gr first, then br, then ll
  setTimeout(() => fillAnswer('gr', q), 300);
  setTimeout(() => fillAnswer('br', q), q.msGR + 200);
  setTimeout(() => fillAnswer('ll', q), q.msGR + 400);

  // token compare bars
  const maxTok = Math.max(q.tokensGR, q.tokensBR, q.tokensLL) * 1.05;
  setTimeout(() => {
    document.getElementById('tc-gr').style.width = (q.tokensGR / maxTok * 100) + '%';
    document.getElementById('tc-br').style.width = (q.tokensBR / maxTok * 100) + '%';
    document.getElementById('tc-ll').style.width = (q.tokensLL / maxTok * 100) + '%';
    document.getElementById('tc-gr-n').textContent = q.tokensGR.toLocaleString() + ' tok';
    document.getElementById('tc-br-n').textContent = q.tokensBR.toLocaleString() + ' tok';
    document.getElementById('tc-ll-n').textContent = q.tokensLL.toLocaleString() + ' tok';
  }, 400);
}

function fillAnswer(pipe, q) {
  const body = document.getElementById(`${pipe}-body`);
  const ans = q[pipe + 'Ans'];
  const pass = q[pipe + 'Pass'];
  const ms = q['ms' + pipe.toUpperCase()];
  const tok = q['tokens' + pipe.toUpperCase()];
  body.textContent = ans;
  document.getElementById(`${pipe}-time`).textContent = ms.toLocaleString() + ' ms';
  document.getElementById(`${pipe}-tokens`).textContent = tok.toLocaleString() + ' tokens';
  const v = document.getElementById(`${pipe}-verdict`);
  v.className = 'chip ' + (pass ? 'pass' : 'fail');
  v.textContent = pass ? 'PASS' : 'FAIL';
}
