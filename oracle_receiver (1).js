// ── ORACLE CONTEXT RECEIVER v2 ────────────────────────────────
// Drop into Rampart and Vantage via: <script src="oracle_receiver.js"></script>
// Compatible with both products — same window API surface.
//
// Features:
//   - Decodes Oracle context from ?oracle= URL parameter
//   - Persists context in sessionStorage for the session lifetime
//   - Drives product APIs: search highlight, node selection, query pre-population
//   - Two-way handoff: "Return to Oracle" button sends current state back
//   - Fires oracle:received and oracle:dismissed custom events
//   - Exposes window.oracleContext and window.oracleHandoffReturn()
//   - Signals acknowledgement back via localStorage for Oracle session log

(function () {
  const STORAGE_KEY  = 'oracle_ctx_v2';
  const ACK_KEY      = 'oracle_ack_v2';
  const ORACLE_URL   = 'https://alturacorp.github.io/';
  const STALE_MS     = 60 * 60 * 1000; // 1 hour before stale warning

  // ── DECODE ──────────────────────────────────────────────────
  function decodeParam() {
    try {
      const raw = new URLSearchParams(window.location.search).get('oracle');
      if (!raw) return null;
      return JSON.parse(decodeURIComponent(escape(atob(raw))));
    } catch { return null; }
  }

  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)); }
    catch { return null; }
  }

  function saveSession(ctx) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx)); }
    catch {}
  }

  // URL param takes priority; fall back to sessionStorage
  const fromUrl = decodeParam();
  const ctx = fromUrl || loadSession();
  if (!ctx) return;

  // Persist for this session if it came from URL
  if (fromUrl) saveSession(ctx);

  window.oracleContext = ctx;
  window.dispatchEvent(new CustomEvent('oracle:received', { detail: ctx }));

  // ── STALENESS ───────────────────────────────────────────────
  const isStale = ctx.ts && (Date.now() - new Date(ctx.ts).getTime()) > STALE_MS;

  // ── PRODUCT API INTEGRATION ─────────────────────────────────
  function integrateWithProduct() {
    // 1. Trigger search highlight with query keywords
    if (ctx.query) {
      const keywords = ctx.query
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 3)
        .join(' ');

      const shInput = document.getElementById('sh-input');
      if (shInput && keywords) {
        shInput.value = keywords;
        if (typeof updateSearchHighlight === 'function') {
          updateSearchHighlight();
          const shBar = document.getElementById('sh-bar');
          if (shBar) shBar.classList.add('show');
        }
      }

      // 2. Pre-populate query input with a structured query from Oracle CoA
      if (ctx.coa) {
        const qInput = document.getElementById('query-input');
        if (qInput && !qInput.value) {
          qInput.placeholder = '← Oracle: ' + ctx.coa;
        }
      }
    }

    // 3. Notify the product via its own notification system
    if (typeof notify === 'function') {
      const product = document.title.includes('Rampart') ? 'Rampart' : 'Vantage';
      notify(
        'Oracle handoff received',
        (ctx.operator ? ctx.operator + ' · ' : '') +
        ctx.coa + ' · conf ' + (ctx.confidence || 0) + '%',
        ctx.threat === 'CRITICAL' || ctx.threat === 'HIGH' ? 'amber' : 'green'
      );
    }

    // 4. Signal acknowledgement back to Oracle via localStorage
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify({
        product: document.title,
        ts: new Date().toISOString(),
        session: ctx.session || '',
        operator: ctx.operator || '',
      }));
    } catch {}
  }

  // Run after product initialises
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(integrateWithProduct, 800));
  } else {
    setTimeout(integrateWithProduct, 800);
  }

  // ── TWO-WAY HANDOFF ──────────────────────────────────────────
  window.oracleHandoffReturn = function (extra) {
    const visible = typeof window.getVisibleNodes === 'function'
      ? window.getVisibleNodes().map(n => ({ id: n.id, label: n.label, type: n.type }))
      : [];

    const payload = {
      source:      document.title,
      source_url:  window.location.href,
      original:    ctx,
      nodes:       visible.slice(0, 40), // top 40 visible nodes
      node_count:  visible.length,
      ts:          new Date().toISOString(),
      operator:    ctx.operator || '',
      session:     ctx.session  || '',
      extra:       extra || {},
    };

    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    window.open(ORACLE_URL + '?return=' + encoded, '_blank');
  };

  // ── INTEL GAPS CHECKLIST ─────────────────────────────────────
  let gapsDone = new Set();
  function renderGapsList() {
    const gaps = ctx.gaps ? ctx.gaps.split(' | ').filter(Boolean) : [];
    if (!gaps.length) return '';
    return gaps.map((g, i) => `
      <div class="orc-gap" id="orc-gap-${i}" onclick="window._orcToggleGap(${i})" style="
        display:flex;align-items:center;gap:8px;padding:4px 0;
        cursor:pointer;transition:opacity .15s;
      ">
        <div style="
          width:12px;height:12px;border:1px solid rgba(168,224,106,.3);
          border-radius:2px;flex-shrink:0;display:grid;place-items:center;
          font-size:9px;color:var(--g,#a8e06a);
        " id="orc-gap-chk-${i}"></div>
        <div style="font-size:10px;color:rgba(255,255,255,.45);letter-spacing:.04em;line-height:1.5;">${g.replace(/</g,'&lt;')}</div>
      </div>`).join('');
  }

  window._orcToggleGap = function(i) {
    if (gapsDone.has(i)) { gapsDone.delete(i); } else { gapsDone.add(i); }
    const chk = document.getElementById('orc-gap-chk-' + i);
    const row = document.getElementById('orc-gap-' + i);
    if (chk) chk.textContent = gapsDone.has(i) ? '✓' : '';
    if (row) row.style.opacity = gapsDone.has(i) ? '.4' : '1';
  };

  // ── AUTH CHAIN ───────────────────────────────────────────────
  function renderAuthChain() {
    if (!ctx.auth_chain) return '';
    try {
      const chain = JSON.parse(ctx.auth_chain);
      return chain.map(s => `
        <div style="display:flex;gap:8px;align-items:center;padding:3px 0;">
          <div style="
            width:7px;height:7px;border-radius:50%;flex-shrink:0;
            background:${s.status==='complete'?'#5cc4c8':s.status==='required'?'#a8e06a':'#d4a84b'};
          "></div>
          <div style="font-size:10px;color:rgba(255,255,255,.4);letter-spacing:.04em;">${s.step}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.2);margin-left:auto;">${s.status.toUpperCase()}</div>
        </div>`).join('');
    } catch { return ''; }
  }

  // ── CoA LIST ─────────────────────────────────────────────────
  function renderCoaList() {
    if (!ctx.all_coas) return '';
    try {
      const coas = JSON.parse(ctx.all_coas);
      return coas.map((c, i) => `
        <div style="
          display:flex;gap:10px;align-items:start;padding:6px 0;
          border-bottom:1px solid rgba(255,255,255,.05);
        ">
          <div style="
            font-size:14px;font-weight:300;
            color:${i===0?'#a8e06a':'rgba(255,255,255,.25)'};
            flex-shrink:0;font-family:'Geist Mono',monospace;
          ">0${i+1}</div>
          <div>
            <div style="font-size:10px;color:${i===0?'#a8e06a':'rgba(255,255,255,.55)'};letter-spacing:.06em;">${(c.title||'').replace(/</g,'&lt;')}</div>
            ${c.risk?`<div style="font-size:9px;color:${c.risk==='HIGH'?'#d45c5c':c.risk==='MEDIUM'?'#d4a84b':'#5cc4c8'};margin-top:2px;letter-spacing:.1em;">${c.risk}</div>`:''}
          </div>
        </div>`).join('');
    } catch { return ''; }
  }

  // ── BANNER ───────────────────────────────────────────────────
  const ts = ctx.ts ? new Date(ctx.ts).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : '';
  const staleHtml = isStale ? `
    <div style="
      background:rgba(212,168,75,.08);border-top:1px solid rgba(212,168,75,.15);
      padding:5px 16px 5px 36px;
      font-family:'Geist Mono',monospace;font-size:9px;
      color:rgba(212,168,75,.6);letter-spacing:.12em;
    ">⚠ Context handed off more than 1 hour ago — may no longer reflect current situation</div>` : '';

  const banner = document.createElement('div');
  banner.id = 'oracle-banner';
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:9999;
    background:#0d1018;
    border-bottom:1px solid rgba(168,224,106,.2);
    border-left:4px solid #a8e06a;
    font-family:'Geist Mono','Courier New',monospace;
    box-shadow:0 4px 32px rgba(0,0,0,.7);
    transition:transform .3s ease;
  `;

  banner.innerHTML = `
    <!-- MAIN ROW -->
    <div id="orc-main-row" style="
      display:flex;align-items:stretch;min-height:46px;cursor:pointer;
    " onclick="window._orcToggleDetail(event)">
      <div style="
        background:rgba(168,224,106,.07);
        padding:0 14px;display:flex;align-items:center;
        border-right:1px solid rgba(168,224,106,.12);flex-shrink:0;
      ">
        <div style="
          width:7px;height:7px;border-radius:50%;background:#a8e06a;
          box-shadow:0 0 6px #a8e06a;
          animation:orcPulse 2.4s ease-in-out infinite;
        "></div>
      </div>
      <div style="padding:9px 16px;flex:1;min-width:0;">
        <div style="
          font-size:7px;letter-spacing:.26em;
          color:rgba(168,224,106,.55);text-transform:uppercase;margin-bottom:4px;
        ">Oracle Handoff${ctx.operator?' · '+ctx.operator.toUpperCase():''}${ctx.session?' · AT-ORC-'+ctx.session:''}${ts?' · '+ts:''}</div>
        <div style="
          font-size:11px;color:#d8d4cc;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.02em;
        ">${(ctx.query||'').replace(/</g,'&lt;')}</div>
        ${ctx.coa?`<div style="font-size:10px;color:rgba(168,224,106,.55);margin-top:2px;letter-spacing:.04em;">→ ${(ctx.coa).replace(/</g,'&lt;')}</div>`:''}
      </div>
      <div style="
        padding:0 14px;display:flex;align-items:center;gap:10px;
        border-left:1px solid rgba(255,255,255,.05);flex-shrink:0;
      ">
        <div style="font-size:9px;letter-spacing:.1em;color:rgba(168,224,106,.45);">
          CONF <span style="color:#a8e06a">${ctx.confidence||0}%</span>
        </div>
        ${ctx.threat?`<div style="
          font-size:8px;letter-spacing:.1em;padding:2px 8px;
          border:1px solid ${ctx.threat==='CRITICAL'||ctx.threat==='HIGH'?'rgba(212,92,92,.3)':'rgba(212,168,75,.25)'};
          color:${ctx.threat==='CRITICAL'||ctx.threat==='HIGH'?'rgba(212,92,92,.7)':'rgba(212,168,75,.6)'};
          background:${ctx.threat==='CRITICAL'||ctx.threat==='HIGH'?'rgba(212,92,92,.06)':'rgba(212,168,75,.06)'};
        ">${ctx.threat}</div>`:''}
        <div id="orc-expand-arrow" style="
          font-size:10px;color:rgba(255,255,255,.2);transition:transform .2s;
        ">▾</div>
        <button onclick="window._orcDismiss(event)" style="
          background:none;border:1px solid rgba(255,255,255,.08);
          color:rgba(255,255,255,.25);font-family:inherit;
          font-size:11px;padding:3px 9px;cursor:pointer;transition:all .12s;
        " onmouseover="this.style.color='rgba(255,255,255,.6)'"
           onmouseout="this.style.color='rgba(255,255,255,.25)'">✕</button>
      </div>
    </div>

    ${staleHtml}

    <!-- DETAIL PANEL -->
    <div id="orc-detail" style="display:none;border-top:1px solid rgba(255,255,255,.05);">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;max-height:280px;">

        <!-- Assessment -->
        <div style="padding:14px 18px;border-right:1px solid rgba(255,255,255,.05);overflow-y:auto;">
          <div style="font-size:7px;letter-spacing:.24em;color:rgba(168,224,106,.4);margin-bottom:8px;text-transform:uppercase;">Assessment</div>
          <div style="font-size:11px;color:rgba(255,255,255,.45);line-height:1.75;">${(ctx.assessment||'—').replace(/</g,'&lt;')}</div>
          ${ctx.oracle_note?`<div style="font-size:10px;color:rgba(168,224,106,.3);margin-top:10px;font-style:italic;">"${ctx.oracle_note.replace(/</g,'&lt;')}"</div>`:''}
        </div>

        <!-- CoAs + Auth chain -->
        <div style="padding:14px 18px;border-right:1px solid rgba(255,255,255,.05);overflow-y:auto;">
          <div style="font-size:7px;letter-spacing:.24em;color:rgba(168,224,106,.4);margin-bottom:8px;text-transform:uppercase;">Courses of Action</div>
          ${renderCoaList() || `<div style="font-size:10px;color:rgba(255,255,255,.2);">${(ctx.coa||'—').replace(/</g,'&lt;')}</div>`}
          ${renderAuthChain()?`
            <div style="font-size:7px;letter-spacing:.24em;color:rgba(168,224,106,.4);margin:12px 0 8px;text-transform:uppercase;">Authority Chain</div>
            ${renderAuthChain()}
          `:''}
        </div>

        <!-- Intel gaps checklist -->
        <div style="padding:14px 18px;overflow-y:auto;">
          <div style="font-size:7px;letter-spacing:.24em;color:rgba(168,224,106,.4);margin-bottom:8px;text-transform:uppercase;">Intelligence Gaps</div>
          ${renderGapsList() || '<div style="font-size:10px;color:rgba(255,255,255,.2);">—</div>'}
          <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
            <button onclick="window.oracleHandoffReturn()" style="
              background:none;border:1px solid rgba(168,224,106,.25);
              color:rgba(168,224,106,.6);font-family:inherit;
              font-size:9px;letter-spacing:.14em;text-transform:uppercase;
              padding:6px 12px;cursor:pointer;transition:all .12s;
            " onmouseover="this.style.borderColor='rgba(168,224,106,.5)';this.style.color='#a8e06a'"
               onmouseout="this.style.borderColor='rgba(168,224,106,.25)';this.style.color='rgba(168,224,106,.6)'">
              ← Return to Oracle
            </button>
            <button onclick="window._orcReSearch()" style="
              background:none;border:1px solid rgba(255,255,255,.1);
              color:rgba(255,255,255,.3);font-family:inherit;
              font-size:9px;letter-spacing:.14em;text-transform:uppercase;
              padding:6px 12px;cursor:pointer;transition:all .12s;
            " onmouseover="this.style.borderColor='rgba(255,255,255,.25)';this.style.color='rgba(255,255,255,.6)'"
               onmouseout="this.style.borderColor='rgba(255,255,255,.1)';this.style.color='rgba(255,255,255,.3)'">
              Re-highlight
            </button>
          </div>
        </div>

      </div>
    </div>

    <style>
      @keyframes orcPulse{0%,100%{opacity:1}50%{opacity:.2}}
    </style>
  `;

  document.body.insertBefore(banner, document.body.firstChild);

  // Offset body content
  function applyOffset() {
    const h = banner.offsetHeight;
    const shell = document.querySelector('.shell,[id="shell"],body>div:not(#oracle-banner):first-of-type');
    if (shell) shell.style.marginTop = h + 'px';
  }
  setTimeout(applyOffset, 120);
  window.addEventListener('resize', applyOffset);

  // ── INTERACTIONS ─────────────────────────────────────────────
  let detailOpen = false;
  window._orcToggleDetail = function(e) {
    if (e && e.target && e.target.tagName === 'BUTTON') return;
    detailOpen = !detailOpen;
    const panel = document.getElementById('orc-detail');
    const arrow = document.getElementById('orc-expand-arrow');
    if (panel) panel.style.display = detailOpen ? 'block' : 'none';
    if (arrow) arrow.style.transform = detailOpen ? 'rotate(180deg)' : 'none';
    setTimeout(applyOffset, 20);
  };

  window._orcDismiss = function(e) {
    if (e) e.stopPropagation();
    banner.style.transform = 'translateY(-100%)';
    // Signal dismissal back to Oracle
    try {
      const ack = JSON.parse(localStorage.getItem(ACK_KEY) || '{}');
      ack.dismissed = new Date().toISOString();
      ack.gapsDone  = [...gapsDone];
      localStorage.setItem(ACK_KEY, JSON.stringify(ack));
    } catch {}
    window.dispatchEvent(new CustomEvent('oracle:dismissed'));
    setTimeout(() => {
      banner.remove();
      const shell = document.querySelector('.shell,[id="shell"],body>div:not(#oracle-banner):first-of-type');
      if (shell) shell.style.marginTop = '';
    }, 320);
  };

  window._orcReSearch = function() {
    if (!ctx.query) return;
    const keywords = ctx.query.replace(/[^\w\s]/g,' ').split(/\s+/).filter(w=>w.length>3).slice(0,3).join(' ');
    const shInput = document.getElementById('sh-input');
    if (shInput) { shInput.value = keywords; if(typeof updateSearchHighlight==='function') updateSearchHighlight(); }
    const shBar = document.getElementById('sh-bar');
    if (shBar) shBar.classList.add('show');
  };

  console.log('Oracle context v2 received:', ctx);

})();
