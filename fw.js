// K-Pulley / K-Box flywheels: load is wheels, not lb (Exxentric sizes, kg·m²). Up to 4 wheels per set, any mix.
// The set box holds the wheels as text ("M + S"); it's saved as total inertia (e.g. 0.035) and never counted in lb totals.
const WHEELS = { XS: .005, S: .010, M: .025, L: .050, XL: .070 }, WCOL = { XS: ['#fff', '#12161F'], S: ['#2FA84F', '#fff'], M: ['#E8B32E', '#12161F'], L: ['#2D6CDF', '#fff'], XL: ['#EB5345', '#fff'] };
const isFW = n => /K-?\s?PULLEY|K-?\s?BOX/i.test(n || '');
const wSum = c => +String(c || '').split('+').reduce((a, k) => a + (WHEELS[k.trim()] || 0), 0).toFixed(3);
const wCombo = v => { let x = Math.round(+v * 1000); const out = []; for (const [k, m] of [['XL', 70], ['L', 50], ['M', 25], ['S', 10], ['XS', 5]]) while (x >= m && out.length < 4) { out.push(k); x -= m; } return x === 0 && out.length ? out.join(' + ') : ''; };
const isInertia = v => +v > 0 && +v < 0.3 && !!wCombo(v);
const fwTxt = v => `${wCombo(v)} · ${(+v).toFixed(3)} kg·m²`;
const fmtW = v => isInertia(v) ? fwTxt(v) : +v;            // history: show wheels for flywheel sets, lb otherwise
const wVal = inp => { const v = (inp && inp.value) || ''; return /[A-Z]/.test(v) ? wSum(v) : parseFloat(v); };
(function(){
  const st = document.createElement('style');
  st.textContent = '.fwi{cursor:pointer;font-weight:800!important;font-size:15px!important;caret-color:transparent}.fwi::placeholder{font-weight:600}'
    + '#fwp{position:absolute;z-index:9999;background:#12161F;color:#fff;border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:none;width:min(330px,94vw);font-family:Montserrat,sans-serif}'
    + '#fwp .cur{font-family:"Bebas Neue";font-size:26px;letter-spacing:.04em;margin-bottom:8px;min-height:30px}#fwp .cur small{display:block;font:600 12px Montserrat,sans-serif;opacity:.75;letter-spacing:0}'
    + '#fwp .ws{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}#fwp button{font:800 16px Montserrat,sans-serif;padding:13px 0;border-radius:8px;border:0;cursor:pointer;margin:0}'
    + '#fwp .act{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px}#fwp .act button{background:#2C3446;color:#fff;font-size:13px;padding:11px 0}#fwp .act .ok{background:#EB5345}#fwp .tip{font-size:11px;opacity:.7;margin-top:6px}';
  document.head.appendChild(st);
  const P = document.createElement('div'); P.id = 'fwp';
  P.innerHTML = '<div class="cur"></div><div class="ws">' + Object.keys(WHEELS).map(k => `<button data-k="${k}" style="background:${WCOL[k][0]};color:${WCOL[k][1]}">${k}</button>`).join('')
    + '</div><div class="act"><button data-a="undo">Undo</button><button data-a="clear">Clear</button><button data-a="ok" class="ok">Done</button></div><div class="tip">Tap up to 4 wheels, any mix.</div>';
  let tgt = null, cur = [];
  const draw = () => { P.querySelector('.cur').innerHTML = cur.length ? `${cur.join(' + ')}<small>${wSum(cur.join('+')).toFixed(3)} kg·m²</small>` : 'Pick Wheels<small>0 kg·m²</small>'; };
  const put = () => { if (!tgt) return; tgt.value = cur.join(' + '); tgt.dispatchEvent(new Event('input', { bubbles: true })); tgt.dispatchEvent(new Event('change', { bubbles: true })); };
  const close = () => { P.style.display = 'none'; tgt = null; };
  const open = inp => { if (!P.isConnected) document.body.appendChild(P); tgt = inp; cur = inp.value ? inp.value.split('+').map(s => s.trim()).filter(k => WHEELS[k]) : [];
    if (!cur.length && /[A-Z]/.test(inp.placeholder) && inp.placeholder !== 'Wheels') cur = inp.placeholder.split('+').map(s => s.trim()).filter(k => WHEELS[k]);
    draw(); put(); P.style.display = 'block'; const r = inp.getBoundingClientRect(), w = P.offsetWidth;
    P.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + scrollX)) + 'px'; P.style.top = (r.bottom + scrollY + 6) + 'px'; };
  P.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k) { if (cur.length < 4) cur.push(b.dataset.k); }
    else if (b.dataset.a === 'undo') cur.pop(); else if (b.dataset.a === 'clear') cur = []; else if (b.dataset.a === 'ok') { put(); return close(); }
    draw(); put(); });
  document.addEventListener('click', e => { const i = e.target.closest('.fwi'); if (i) { e.preventDefault(); return open(i); } if (tgt && !e.target.closest('#fwp')) close(); }, true);
  document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('fwi')) e.target.blur(); });
  // turn the weight boxes of K-Pulley / K-Box cards into wheel pickers
  const fwify = () => { if (typeof items === 'undefined') return;
    document.querySelectorAll('.ex[data-idx]').forEach(card => { const it = items[+card.dataset.idx]; if (!it || !isFW(it.exercise)) return;
      card.querySelectorAll('[data-w]').forEach(inp => { if (inp.classList.contains('fwi')) return;
        const v = inp.value, ph = inp.placeholder; inp.type = 'text'; inp.readOnly = true; inp.inputMode = 'none'; inp.classList.add('fwi'); inp.title = 'Wheels (tap to pick)';
        if (v && !/[A-Z]/.test(v)) inp.value = isInertia(v) ? wCombo(v) : ''; inp.placeholder = isInertia(ph) ? wCombo(ph) : 'Wheels'; });
      card.querySelectorAll('.sethdr span').forEach(s => { if (/^Weight/.test(s.textContent)) s.firstChild.nodeValue = 'Wheels '; }); }); };
  let q = 0; new MutationObserver(() => { cancelAnimationFrame(q); q = requestAnimationFrame(fwify); }).observe(document.documentElement, { childList: true, subtree: true });
})();
