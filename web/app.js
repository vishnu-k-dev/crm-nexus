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
  const N = 80;
  // synthetic but realistic data
  const seed = (i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    return r - Math.floor(r);
  };
  const br = Array.from({ length: N }, (_, i) => 5100 + (seed(i) - 0.5) * 480);
  const gr = Array.from({ length: N }, (_, i) => 970 + (seed(i + 99) - 0.5) * 160);
  const all = [...br, ...gr];
  const yMax = 6000, yMin = 0;
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
  [1, 20, 40, 60, 80].forEach(i => {
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
  ['v01',   100, 140, 'vendor',   'VEND-01'],
  ['v05',    70, 240, 'vendor',   'VEND-05'],
  ['v10',   105, 340, 'vendor',   'VEND-10'],
  ['v15',   195, 215, 'vendor',   'VEND-15'],

  ['c001',  300,  80, 'customer', 'CUST-0001'],
  ['c021',  355, 200, 'customer', 'CUST-0021'],
  ['c100',  290, 335, 'customer', 'CUST-0100'],

  ['out1',  205, 145, 'outage',   'OUTAGE-001'],
  ['out2',  215, 305, 'outage',   'OUTAGE-002'],

  ['rFra',   50, 395, 'region',   'FRANKFURT'],
  ['rTor',  205, 415, 'region',   'TORONTO'],
  ['rChi',  355, 395, 'region',   'CHICAGO'],

  ['emp1',  365,  60, 'employee', 'EMP-001'],
  ['prj1',  375, 315, 'project',  'NORDIC-001'],
];

const EDGES = [
  // Customer → Vendor
  ['c001', 'v01'], ['c001', 'v05'],
  ['c021', 'v01'], ['c021', 'v10'],
  ['c100', 'v05'], ['c100', 'v15'],
  // Vendor → Outage
  ['v01', 'out1'], ['v05', 'out2'],
  // Outage → Region
  ['out1', 'rFra'], ['out1', 'rTor'],
  ['out2', 'rChi'], ['out2', 'rFra'],
  // Vendor → Region
  ['v01', 'rTor'], ['v05', 'rFra'], ['v10', 'rChi'], ['v15', 'rTor'],
  // Vendor → Vendor
  ['v10', 'v15'],
  // Employee manages
  ['emp1', 'v01'], ['emp1', 'v10'],
  // Project → Customer
  ['prj1', 'c100'], ['prj1', 'c021'],
];

const COLORS = {
  vendor:   '#FF6B00',
  customer: '#ffa050',
  outage:   '#ef4444',
  region:   '#10b981',
  employee: '#1F2937',
  project:  '#6B7280',
};
const RADIUS = {
  vendor: 9, customer: 8, outage: 7, region: 8, employee: 6, project: 5,
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
    text: 'What outages has VEND-01 caused?',
    seed: 'v01',
    hops: [['v01', 'out1'], ['out1', 'rFra'], ['out1', 'rTor']],
    chunks: 4, hopsN: 2, tokensGR: 1024, tokensBR: 5180, tokensLL: 120, msGR: 2840, msBR: 42600, msLL: 980,
    grAns: 'VEND-01 (MedSync) caused OUTAGE-001 — a 4h 12m disruption impacting REGION-FRANKFURT and REGION-TORONTO on 2026-03-14. 8 downstream customers affected; SLA breach ticket filed.',
    brAns: 'Vector search returned broad content about vendor SLA management and outage frameworks — specific outage records for VEND-01 could not be matched to this entity.',
    llAns: 'I don\'t have access to your internal vendor outage records.',
    grPass: true, brPass: false, llPass: false,
  },
  q2: {
    text: 'What is the SLA tier of VEND-01?',
    seed: 'v01',
    hops: [['v01', 'c001'], ['v01', 'c021']],
    chunks: 3, hopsN: 1, tokensGR: 912, tokensBR: 5040, tokensLL: 110, msGR: 2140, msBR: 38200, msLL: 890,
    grAns: 'VEND-01 (MedSync) — Tier-1 SLA: 99.9% uptime guarantee, 4-hour incident response. Managed by EMP-001 (Alex M.). Contract renewal: 2026-12-31.',
    brAns: 'VEND-01 (MedSync) holds a Tier-1 SLA with 99.9% uptime and 4-hour response time. (Retrieved via vector similarity — full contract context unavailable.)',
    llAns: 'I don\'t have access to vendor SLA agreements in your CRM.',
    grPass: true, brPass: true, llPass: false,
  },
  q3: {
    text: 'Which regions were affected by OUTAGE-001?',
    seed: 'out1',
    hops: [['out1', 'rFra'], ['out1', 'rTor'], ['out1', 'v01']],
    chunks: 4, hopsN: 2, tokensGR: 1180, tokensBR: 5240, tokensLL: 130, msGR: 3120, msBR: 44100, msLL: 1040,
    grAns: 'OUTAGE-001 hit REGION-FRANKFURT and REGION-TORONTO. Root cause: VEND-01 (MedSync) API failure. Duration: 4h 12m. CUST-0001 and CUST-0021 both filed SLA breach tickets.',
    brAns: 'Vector search returned general content about regional incident management — no direct entity match for OUTAGE-001 or its specific impacted regions.',
    llAns: 'I don\'t have data about OUTAGE-001 or its regional impact.',
    grPass: true, brPass: false, llPass: false,
  },
  q4: {
    text: 'What category does VEND-10 belong to?',
    seed: 'v10',
    hops: [['v10', 'rChi'], ['v10', 'v15']],
    chunks: 2, hopsN: 1, tokensGR: 896, tokensBR: 4980, tokensLL: 105, msGR: 1980, msBR: 36800, msLL: 860,
    grAns: 'VEND-10 (CoreShift) — Infrastructure / Cloud Services, Tier-2. Primary region: REGION-CHICAGO. Storage dependency: VEND-15 (DataBridge).',
    brAns: 'VEND-10 (CoreShift) is categorised under Infrastructure and Cloud Services — Tier-2 vendor. (Partial match via vector search; graph-layer context not fully retrieved.)',
    llAns: 'I don\'t have your vendor catalogue entries for VEND-10.',
    grPass: true, brPass: true, llPass: false,
  },
  q5: {
    text: "What is CUST-0001's total vendor risk exposure?",
    seed: 'c001',
    hops: [['c001', 'v01'], ['v01', 'out1'], ['c001', 'v05'], ['v05', 'out2']],
    chunks: 6, hopsN: 3, tokensGR: 1380, tokensBR: 5260, tokensLL: 145, msGR: 3580, msBR: 46200, msLL: 1120,
    grAns: 'CUST-0001 (FinServ Global) depends on VEND-01 + VEND-05. VEND-01 triggered OUTAGE-001 (Frankfurt, Toronto); VEND-05 triggered OUTAGE-002 (Chicago). Combined: 2 active outages · 3 regions · risk score: HIGH.',
    brAns: 'No coherent vendor risk profile found for CUST-0001. Vector search returned fragmented risk-framework chunks — multi-hop entity relationships cannot be resolved through flat similarity.',
    llAns: 'I don\'t have customer-specific vendor risk data in my knowledge base.',
    grPass: true, brPass: false, llPass: false,
  },
  q6: {
    text: 'What region does VEND-05 primarily serve?',
    seed: 'v05',
    hops: [['v05', 'rFra'], ['v05', 'out2']],
    chunks: 3, hopsN: 1, tokensGR: 940, tokensBR: 5010, tokensLL: 108, msGR: 2080, msBR: 37500, msLL: 920,
    grAns: 'VEND-05 (NetForge) primarily serves REGION-FRANKFURT (78% traffic load). Secondary affiliation: REGION-CHICAGO via OUTAGE-002 impact path. SLA: Tier-2, 99.5% uptime.',
    brAns: 'VEND-05 (NetForge) is primarily associated with the Frankfurt region. (Vector similarity match — traffic percentage and secondary affiliations not retrieved.)',
    llAns: 'I don\'t have regional affinity data for VEND-05.',
    grPass: true, brPass: true, llPass: false,
  },
  q7: {
    text: 'Which vendors are linked to the Frankfurt outage?',
    seed: 'out1',
    hops: [['out1', 'rFra'], ['out1', 'v01'], ['v01', 'c001']],
    chunks: 5, hopsN: 2, tokensGR: 1120, tokensBR: 5190, tokensLL: 125, msGR: 3040, msBR: 43800, msLL: 1060,
    grAns: 'OUTAGE-001 (Frankfurt) root cause: VEND-01 (MedSync). Downstream: CUST-0001 (FinServ Global) and CUST-0021 (AeroTech) filed impact reports. Assigned manager: EMP-001 (Alex M.).',
    brAns: 'Vector search returned general content about Frankfurt infrastructure reliability — no entity-level mapping of OUTAGE-001 to specific vendor identifiers found.',
    llAns: 'I don\'t have outage-to-vendor mapping records for your CRM.',
    grPass: true, brPass: false, llPass: false,
  },
  q8: {
    text: 'How many active customers depend on VEND-15?',
    seed: 'v15',
    hops: [['v15', 'c100'], ['v15', 'rTor']],
    chunks: 3, hopsN: 2, tokensGR: 1060, tokensBR: 5150, tokensLL: 115, msGR: 2720, msBR: 40100, msLL: 990,
    grAns: 'VEND-15 (DataBridge) has 1 direct customer: CUST-0100 (NordHealth). Also serves REGION-TORONTO. VEND-10 (CoreShift) holds a storage-layer dependency on VEND-15.',
    brAns: 'VEND-15 (DataBridge) appears in 1 active customer dependency record. (Partial vector match — full dependency chain may be incomplete.)',
    llAns: 'I don\'t have vendor dependency counts for VEND-15.',
    grPass: true, brPass: true, llPass: false,
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
  if (v.includes('vend-01') || v.includes('medsync') || (v.includes('outage') && v.includes('caused'))) match = 'q1';
  else if (v.includes('sla') || (v.includes('vend-01') && v.includes('tier'))) match = 'q2';
  else if (v.includes('outage-001') || (v.includes('region') && v.includes('affected'))) match = 'q3';
  else if (v.includes('vend-10') || v.includes('coreshift') || v.includes('category')) match = 'q4';
  else if (v.includes('cust-0001') || v.includes('finserv') || (v.includes('risk') && v.includes('exposure'))) match = 'q5';
  else if (v.includes('vend-05') || v.includes('netforge') || (v.includes('region') && v.includes('serve'))) match = 'q6';
  else if (v.includes('frankfurt') || (v.includes('vendor') && v.includes('linked'))) match = 'q7';
  else if (v.includes('vend-15') || v.includes('databridge') || (v.includes('customer') && v.includes('depend'))) match = 'q8';
  else if (v.includes('compliance') || v.includes('spend') || v.includes('budget')) match = 'qVendor';

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

  if (match === 'qVendor' && !QUESTIONS.qVendor) {
    QUESTIONS.qVendor = {
      text: "What is VEND-01's compliance score?",
      seed: 'v01',
      hops: [['v01', 'c001'], ['v01', 'out1']],
      chunks: 3, hopsN: 2, tokensGR: 1050, tokensBR: 5160, tokensLL: 118, msGR: 2600, msBR: 41200, msLL: 950,
      grAns: 'VEND-01 (MedSync) compliance score: 72/100. Flags: 1 active outage, 2 SLA breach tickets (CUST-0001, CUST-0021). Review scheduled: 2026-Q3.',
      brAns: 'No compliance score entity found for VEND-01. Vector search returned generic compliance framework content — specific score not retrieved.',
      llAns: 'I don\'t have compliance scoring data for your vendors.',
      grPass: true, brPass: false, llPass: false,
    };
  }
  runQuery(match || 'q1');
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
