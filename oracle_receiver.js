// ── ORACLE CONTEXT RECEIVER ───────────────────────────────────
// Drop this script into Rampart and Vantage.
// Place before </body> or in your existing script block.
//
// When Oracle hands off a context, it appends ?oracle=<base64> to the URL.
// This receiver decodes it and surfaces the context as a notification banner.
// It also exposes window.oracleContext for use anywhere in your app.

(function() {

  function decodeOracleContext() {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('oracle');
      if (!raw) return null;
      return JSON.parse(decodeURIComponent(escape(atob(raw))));
    } catch(e) {
      console.warn('Oracle receiver: failed to decode context', e);
      return null;
    }
  }

  const ctx = decodeOracleContext();
  if (!ctx) return;

  // Expose globally for use by Rampart/Vantage
  window.oracleContext = ctx;

  // Build and inject the banner
  const banner = document.createElement('div');
  banner.id = 'oracle-handoff-banner';
  banner.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 9999;
    background: #0d1018;
    border-bottom: 1px solid rgba(168,224,106,.25);
    border-left: 4px solid #a8e06a;
    padding: 0;
    font-family: 'Geist Mono', 'Courier New', monospace;
    font-size: 11px;
    color: #d8d4cc;
    box-shadow: 0 4px 24px rgba(0,0,0,.6);
    transition: transform .3s ease;
  `;

  const ts = ctx.ts ? new Date(ctx.ts).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  }) : '';

  banner.innerHTML = `
    <div style="display:flex;align-items:stretch;min-height:48px;">
      <div style="
        background:rgba(168,224,106,.08);
        padding:0 16px;
        display:flex;align-items:center;justify-content:center;
        border-right:1px solid rgba(168,224,106,.15);
        flex-shrink:0;
      ">
        <div style="
          width:8px;height:8px;border-radius:50%;
          background:#a8e06a;
          box-shadow:0 0 6px #a8e06a;
          animation:oraclePulse 2s ease-in-out infinite;
        "></div>
      </div>
      <div style="padding:10px 16px;flex:1;min-width:0;">
        <div style="
          font-size:7px;letter-spacing:.26em;
          color:rgba(168,224,106,.6);
          text-transform:uppercase;margin-bottom:5px;
        ">Oracle Context Handoff${ctx.operator ? ' · Operator: ' + ctx.operator.toUpperCase() : ''}${ctx.session ? ' · Session: AT-ORC-' + ctx.session : ''}${ts ? ' · ' + ts : ''}</div>
        <div style="
          font-size:11px;color:#d8d4cc;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          letter-spacing:.02em;
        ">${(ctx.query || '').replace(/</g,'&lt;')}</div>
        ${ctx.coa ? `<div style="font-size:10px;color:rgba(168,224,106,.6);margin-top:3px;letter-spacing:.04em;">→ ${ctx.coa}</div>` : ''}
      </div>
      <div style="
        padding:0 16px;
        display:flex;align-items:center;gap:10px;
        border-left:1px solid rgba(255,255,255,.06);
        flex-shrink:0;
      ">
        <div style="
          font-size:9px;letter-spacing:.12em;
          color:rgba(168,224,106,.5);
        ">CONF <span style="color:#a8e06a">${ctx.confidence || 0}%</span></div>
        <div style="
          font-size:9px;letter-spacing:.1em;
          color:rgba(212,168,75,.6);
          background:rgba(212,168,75,.06);
          border:1px solid rgba(212,168,75,.2);
          padding:2px 8px;
        ">${(ctx.threat || 'UNKNOWN').toUpperCase()}</div>
        <button onclick="document.getElementById('oracle-handoff-banner').style.transform='translateY(-100%)';setTimeout(()=>document.getElementById('oracle-handoff-banner').remove(),320);" style="
          background:none;border:1px solid rgba(255,255,255,.08);
          color:rgba(255,255,255,.3);font-family:inherit;
          font-size:11px;padding:4px 10px;cursor:pointer;
          transition:all .12s;
        " onmouseover="this.style.borderColor='rgba(255,255,255,.2)';this.style.color='rgba(255,255,255,.6)'"
           onmouseout="this.style.borderColor='rgba(255,255,255,.08)';this.style.color='rgba(255,255,255,.3)'">✕</button>
      </div>
    </div>
    ${ctx.assessment ? `
    <div id="oracle-ctx-detail" style="display:none;padding:12px 16px 14px 36px;border-top:1px solid rgba(255,255,255,.05);">
      <div style="font-size:10px;color:#9a9fae;line-height:1.75;max-width:800px;">${ctx.assessment.replace(/</g,'&lt;')}</div>
      ${ctx.coa_desc ? `<div style="font-size:10px;color:rgba(168,224,106,.5);margin-top:8px;letter-spacing:.04em;">Recommended: ${ctx.coa_desc.replace(/</g,'&lt;')}</div>` : ''}
      ${ctx.risks ? `<div style="font-size:9px;color:rgba(255,255,255,.25);margin-top:8px;letter-spacing:.06em;">${ctx.risks.replace(/</g,'&lt;')}</div>` : ''}
      ${ctx.oracle_note ? `<div style="font-size:10px;color:rgba(168,224,106,.3);margin-top:8px;font-style:italic;letter-spacing:.02em;">"${ctx.oracle_note.replace(/</g,'&lt;')}"</div>` : ''}
    </div>` : ''}
    <style>
      @keyframes oraclePulse{0%,100%{opacity:1}50%{opacity:.25}}
    </style>
  `;

  // Toggle detail on click
  const mainRow = banner.querySelector('div');
  if (mainRow) {
    mainRow.style.cursor = 'pointer';
    mainRow.addEventListener('click', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      const detail = document.getElementById('oracle-ctx-detail');
      if (detail) {
        const visible = detail.style.display !== 'none';
        detail.style.display = visible ? 'none' : 'block';
      }
    });
  }

  // Insert at top of body
  document.body.insertBefore(banner, document.body.firstChild);

  // Nudge body down so it doesn't overlap content
  const bannerHeight = () => banner.offsetHeight;
  function applyOffset() {
    const bodyEl = document.querySelector('.shell, #shell, body > div:first-of-type');
    if (bodyEl && bodyEl !== banner) {
      bodyEl.style.marginTop = bannerHeight() + 'px';
    }
  }
  setTimeout(applyOffset, 100);
  window.addEventListener('resize', applyOffset);

  console.log('Oracle context received:', ctx);

})();
