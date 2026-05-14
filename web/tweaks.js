/* Tweaks panel — vanilla JS implementation of the host protocol */
(function () {
  const panel = document.getElementById('tweaks-panel');
  if (!panel) return;

  const defaults = window.TWEAK_DEFAULTS || { accent: '#FF6B00', theme: 'light', graphLabels: 'on', graphSpeed: 1, density: 'comfortable' };
  let state = { ...defaults };

  function persist(partial) {
    state = { ...state, ...partial };
    apply();
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: partial }, '*');
    } catch (e) {}
  }

  function apply() {
    const root = document.documentElement;
    // accent
    root.style.setProperty('--orange', state.accent);
    root.style.setProperty('--orange-deep', shade(state.accent, -10));
    root.style.setProperty('--orange-soft', hexToRgba(state.accent, 0.18));
    root.style.setProperty('--orange-glow', hexToRgba(state.accent, 0.06));
    root.style.setProperty('--orange-tint', hexToRgba(state.accent, 0.06));

    // theme
    if (state.theme === 'dark') document.body.setAttribute('data-theme', 'dark');
    else document.body.removeAttribute('data-theme');

    // graph labels
    document.body.toggleAttribute('data-no-labels', state.graphLabels === 'off');

    // density
    document.body.toggleAttribute('data-compact', state.density === 'compact');

    // graph speed (read by app.js for traversal)
    window.__graphSpeed = parseFloat(state.graphSpeed) || 1;

    // reflect in UI
    document.querySelectorAll('#twAccent .tw-swatch').forEach(b => {
      b.classList.toggle('active', b.dataset.val.toLowerCase() === state.accent.toLowerCase());
    });
    setSeg('twTheme', state.theme);
    setSeg('twLabels', state.graphLabels);
    setSeg('twDensity', state.density);
    const speed = document.getElementById('twSpeed');
    if (speed) { speed.value = state.graphSpeed; document.getElementById('twSpeedVal').textContent = state.graphSpeed + '×'; }
  }

  function setSeg(groupId, val) {
    document.querySelectorAll('#' + groupId + ' .tw-seg').forEach(b => {
      b.classList.toggle('active', b.dataset.val === val);
    });
  }

  function hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function shade(hex, pct) {
    const h = hex.replace('#', '');
    let r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
    const f = (1 + pct / 100);
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // Wire controls
  document.querySelectorAll('#twAccent .tw-swatch').forEach(b => {
    b.addEventListener('click', () => persist({ accent: b.dataset.val }));
  });
  ['twTheme', 'twLabels', 'twDensity'].forEach(id => {
    document.querySelectorAll('#' + id + ' .tw-seg').forEach(b => {
      const key = id === 'twTheme' ? 'theme' : id === 'twLabels' ? 'graphLabels' : 'density';
      b.addEventListener('click', () => persist({ [key]: b.dataset.val }));
    });
  });
  const speed = document.getElementById('twSpeed');
  if (speed) {
    speed.value = state.graphSpeed;
    speed.addEventListener('input', (e) => {
      state.graphSpeed = parseFloat(e.target.value);
      document.getElementById('twSpeedVal').textContent = state.graphSpeed + '×';
      window.__graphSpeed = state.graphSpeed;
    });
    speed.addEventListener('change', (e) => persist({ graphSpeed: parseFloat(e.target.value) }));
  }

  document.getElementById('twClose').addEventListener('click', () => {
    hide();
    try { window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); } catch (e) {}
  });

  function show() { panel.hidden = false; }
  function hide() { panel.hidden = true; }

  // Host protocol: register listener BEFORE announcing availability
  window.addEventListener('message', (ev) => {
    const t = ev.data && ev.data.type;
    if (t === '__activate_edit_mode') show();
    else if (t === '__deactivate_edit_mode') hide();
  });

  // Announce availability
  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}

  // Initial apply
  apply();
})();
