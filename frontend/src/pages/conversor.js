/**
 * Página "Conversor de Tibia Coins": parâmetros, conversores, referência,
 * variação histórica, guia Histórico e botões Buscar.
 */
import { getTCValue, getAvgCoinValue } from '../services/api.js';

export function initConversor(){
  const SERVERS = ["Aethera","Antica","Astera","Belobra","Blumera","Bona","Bravoria","Calmera","Cantabra","Celebra","Celesta","Citra","Collabra","Descubra","Dia","Dracobra","Eclipta","Epoca","Escura","Etebra","Ferobra","Firmera","Floribra","Gentebra","Gladera","Gladibra","Harmonia","Havera","Honbra","Hostera","Idyllia","Ignibra","Ignitera","Inabra","Issobra","Jadebra","Jinxibra","Junera","Kalanta","Kalibra","Kalimera","Kanda","Karmeya","Lobera","Luminera","Lutabra","Luzibra","Maligna","Menera","Monstera","Monza","Mystera","Nefera","Nevia","Noctalia","Oceanis","Ombra","Opulera","Ourobra","Pacera","Peloria","Penumbra","Premia","Quelibra","Quidera","Quintera","Rasteibra","Refugia","Retalia","Secura","Serdebra","Sinistra","Solidera","Sombra","Sonira","Stralis","Talera","Tempestera","Terribra","Thyria","Tornabra","Unebra","Ustebra","Venebra","Victoris","Vunira","Wickera","Wintera","Xybra","Xyla","Xymera","Yonabra","Yovera","Yubra","Zuna","Zunera"];
  const LS_STATE = 'tibiaCoinConverter.v1';
  const LS_HIST  = 'tibiaCoinConverter.history.v1';
  const DEFAULTS = { server:'Descubra', p250:'52,20', pServ:'46.000', inCoin:'1,00', inTC:'1.000' };
  const REF = [1,2,3,4,5,10,20,30,40,50,60,70,80,90,100,110,120,130,140,150];
  const KK = 1000000;
  const DAY = 86400000;
  const $ = id => document.getElementById(id);
  const numInputs = ['p250','pServ','inCoin','inTC'].map($);
  const serverSel = $('server');

  let history = [];          // [{id, server, ts, v250, serv}] — salvo no navegador (localStorage)

  /* ---------- formatação ---------- */
  const fmt = (n, min, max) => new Intl.NumberFormat('pt-BR',{minimumFractionDigits:min, maximumFractionDigits:max ?? min}).format(n);
  const brl = n => 'R$ ' + fmt(n,2);
  const p2 = n => String(n).padStart(2,'0');
  const dateStr = d => `${p2(d.getDate())}/${p2(d.getMonth()+1)}/${d.getFullYear()}`;
  const dateTimeStr = d => `${dateStr(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function parse(s){
    s = String(s||'').trim();
    if(!s) return NaN;
    if(s.includes(',')){
      s = s.replace(/\./g,'').replace(',', '.').replace(/,/g,'');
    } else {
      const parts = s.split('.');
      if(parts.length === 2 && parts[1].length !== 3) s = parts.join('.');
      else s = parts.join('');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }

  /* ---------- estado salvo ---------- */
  function currentState(){
    const s = { server: serverSel.value };
    numInputs.forEach(el => s[el.id] = el.value);
    return s;
  }
  function applyState(s){
    if(!s) return;
    if(typeof s.server === 'string' && SERVERS.includes(s.server)) serverSel.value = s.server;
    numInputs.forEach(el => { if(typeof s[el.id] === 'string') el.value = s[el.id].replace(/[^0-9.,]/g,''); });
  }
  function loadLocal(){
    try { applyState(JSON.parse(localStorage.getItem(LS_STATE) || 'null')); } catch(e){}
    try {
      const h = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
      if(Array.isArray(h)) history = h.filter(r => r && typeof r.ts === 'number');
    } catch(e){}
  }
  function saveState(){
    try { localStorage.setItem(LS_STATE, JSON.stringify(currentState())); } catch(e){}
  }
  function saveLocalHistory(){
    try { localStorage.setItem(LS_HIST, JSON.stringify(history)); } catch(e){}
  }

  /* ---------- histórico ---------- */
  const same = (a,b) => Math.abs(a-b) < 0.005;
  const entriesFor = server => history.filter(r => r.server === server).sort((a,b) => b.ts - a.ts);

  function commitParams(){
    const server = serverSel.value;
    const v250 = Math.round(parse($('p250').value)*100)/100;
    const serv = Math.round(parse($('pServ').value)*100)/100;
    if(!(v250 > 0) || !(serv > 0)) return;
    const last = entriesFor(server)[0];
    if(last && same(last.v250, v250) && same(last.serv, serv)) return; // nada mudou para este servidor
    const entry = { server, ts: Date.now(), v250, serv };
    history.push({ id: 'l' + entry.ts, ...entry });
    saveLocalHistory();
    renderAll();
  }

  const noData = title => `<div class="var"><span class="t">${title}</span><span class="v flat">—<small>Sem registro</small></span></div>`;

  function variationHTML(title, cur, refVal){
    if(!(cur > 0) || !(refVal > 0)) return noData(title);
    const pct = (cur - refVal) / refVal * 100;
    const cls = Math.abs(pct) < 0.005 ? 'flat' : pct > 0 ? 'up' : 'down';
    const icon = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■';
    const word = cls === 'up' ? 'Aumento' : cls === 'down' ? 'Queda' : 'Estável';
    return `<div class="var"><span class="t">${title}</span><span class="v ${cls}">${icon} ${fmt(Math.abs(pct),2)}%<small>${word}</small></span></div>`;
  }

  function renderVariation(v250, serv){
    const server = serverSel.value;
    const list = entriesFor(server);
    // Se o registro mais recente já é o valor atual, compara com o anterior a ele.
    let ref = list[0];
    if(ref && same(ref.v250, Math.round(v250*100)/100) && same(ref.serv, Math.round(serv*100)/100)) ref = list[1];

    let period = noData('Período');
    if(ref){
      const today = new Date(); today.setHours(0,0,0,0);
      const d = new Date(ref.ts); d.setHours(0,0,0,0);
      const days = Math.round((today - d) / DAY);
      period = `<div class="var"><span class="t">Período</span><span class="v days">${days} ${days === 1 ? 'dia' : 'dias'}<small>desde ${dateStr(new Date(ref.ts))}</small></span></div>`;
    }

    $('varList').innerHTML =
      variationHTML('Valor 250 TC', v250, ref && ref.v250) +
      variationHTML('Valor TC Servidor', serv, ref && ref.serv) +
      period;
  }

  function renderHistoryTab(){
    const sel = $('histFilter');
    const withData = SERVERS.filter(s => history.some(r => r.server === s));
    const prev = sel.value;
    sel.innerHTML = '<option value="">Todos os servidores</option>' + withData.map(s => `<option value="${s}">${s}</option>`).join('');
    sel.value = withData.includes(prev) ? prev : '';
    const filter = sel.value;
    const rows = history.filter(r => !filter || r.server === filter).sort((a,b) => b.ts - a.ts);
    $('histCount').textContent = history.length ? `(${history.length})` : '';
    $('histMeta').textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}` : '';
    $('histEmpty').hidden = rows.length > 0;
    $('histBody').innerHTML = rows.map(r => `<tr>
      <td class="l">${esc(r.server)}</td>
      <td class="l">${dateTimeStr(new Date(r.ts))}</td>
      <td class="r">${brl(r.v250)}</td>
      <td class="c">${fmt(r.serv,0,2)}</td></tr>`).join('');
  }

  /* ---------- cálculos ---------- */
  function calc(){
    const v250 = parse($('p250').value);
    const serv = parse($('pServ').value);
    const coinKK = parse($('inCoin').value);
    const tcIn = Math.round(parse($('inTC').value));
    const unit = v250 / 250;
    const ok = v250 > 0 && serv > 0;
    $('warn').hidden = ok;
    $('unit').textContent = v250 > 0 ? 'R$ ' + fmt(unit,4) : '—';

    if(!isNaN(coinKK)){
      $('c1Coin').textContent = fmt(coinKK,2) + ' KK';
      if(ok){
        const tc = coinKK * KK / serv;
        $('c1TC').textContent = fmt(tc,2);
        $('c1BRL').textContent = brl(tc * unit);
      } else { $('c1TC').textContent = '—'; $('c1BRL').textContent = '—'; }
    } else { ['c1Coin','c1TC','c1BRL'].forEach(id => $(id).textContent = '—'); }

    if(!isNaN(tcIn)){
      $('c2TC').textContent = fmt(tcIn,0);
      $('c2Coin').textContent = serv > 0 ? fmt(tcIn * serv / KK,2) + ' KK' : '—';
      $('c2BRL').textContent = v250 > 0 ? brl(tcIn * unit) : '—';
    } else { ['c2TC','c2Coin','c2BRL'].forEach(id => $(id).textContent = '—'); }

    $('refBody').innerHTML = REF.map(k => {
      const tc = ok ? k * KK / serv : NaN;
      const hit = !isNaN(coinKK) && Math.abs(coinKK - k) < 1e-9 ? ' class="hit"' : '';
      return `<tr${hit}><td class="c l">${fmt(k,1)} KK</td><td class="t">${ok ? fmt(tc,1) : '—'}</td><td class="r">${ok ? brl(tc*unit) : '—'}</td></tr>`;
    }).join('');

    renderVariation(v250, serv);
  }
  function renderAll(){ calc(); renderHistoryTab(); }

  /* ---------- entradas ---------- */
  function sanitize(el){
    const before = el.value;
    const pos = el.selectionStart ?? before.length;
    const clean = before.replace(/[^0-9.,]/g,'');
    if(clean !== before){
      const removedBefore = before.slice(0,pos).replace(/[0-9.,]/g,'').length;
      el.value = clean;
      const p = Math.max(0, pos - removedBefore);
      try { el.setSelectionRange(p,p); } catch(e){}
    }
  }
  function formatField(el){
    const n = parse(el.value);
    if(isNaN(n)) return;
    switch(el.dataset.kind){
      case 'money': el.value = fmt(n,2); break;
      case 'num':   el.value = fmt(n,0,2); break;
      case 'kk':    el.value = fmt(n,2); break;
      case 'int':   el.value = fmt(Math.round(n),0); break;
    }
  }
  function commitField(el){
    formatField(el);
    calc();
    saveState();
    if(el.dataset.param) commitParams();
  }

  // Enter confirma o campo, recalcula e leva ao próximo campo.
  const ORDER = ['p250','pServ','server','inCoin','inTC'].map($);
  function nextField(el){
    const i = ORDER.indexOf(el);
    const nx = ORDER[i + 1];
    if(nx){ nx.focus(); if(nx.select) nx.select(); }
    else if(el.select) el.select();
  }
  numInputs.forEach(el => {
    el.addEventListener('beforeinput', e => {
      if(e.data && /[^0-9.,]/.test(e.data) && e.inputType && e.inputType.startsWith('insert')) e.preventDefault();
    });
    el.addEventListener('input', () => { sanitize(el); calc(); saveState(); });
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.keyCode === 13){ e.preventDefault(); commitField(el); nextField(el); }
    });
    el.addEventListener('change', () => commitField(el));
  });
  function commitServer(){ calc(); saveState(); commitParams(); }
  serverSel.addEventListener('change', commitServer);
  serverSel.addEventListener('keydown', e => {
    if(e.key === 'Enter' || e.keyCode === 13){ e.preventDefault(); commitServer(); nextField(serverSel); }
  });
  $('histFilter').addEventListener('change', renderHistoryTab);

  /* ---------- guias ---------- */
  const tabs = [$('tab-conv'), $('tab-hist')];
  function selectTab(btn, focus){
    tabs.forEach(t => {
      const on = t === btn;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if(focus) btn.focus();
  }
  tabs.forEach((t,i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', e => {
      if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){ e.preventDefault(); selectTab(tabs[(i + 1) % 2], true); }
    });
  });
  if(location.hash === '#historico') selectTab($('tab-hist'));

  function setStatus(msg){ $('status').textContent = msg || ''; }

  /* ---------- busca automática pelos webservices ---------- */
  const DAY_MS = 86400000;
  const fetchBtn = $('fetchBtn');
  const fetchMsg = $('fetchMsg');
  const fetchServBtn = $('fetchServBtn');
  const fetchServMsg = $('fetchServMsg');

  function showMsg(el, kind, text){
    el.hidden = false;
    el.className = 'fetch-msg' + (kind ? ' ' + kind : '');
    el.textContent = text;
  }
  function startLoading(btn, msgEl, text){
    btn.disabled = true;
    btn.textContent = 'Buscando…';
    showMsg(msgEl, '', text);
    // Se demorar, avisa que o servidor pode estar acordando.
    return setTimeout(() => {
      if(btn.disabled) showMsg(msgEl, '', text + ' O servidor pode estar acordando; isso leva até 1 minuto.');
    }, 6000);
  }
  function stopLoading(btn, timer){
    clearTimeout(timer);
    btn.disabled = false;
    btn.textContent = 'Buscar';
  }

  /* Valor 250 TC (R$) — tibialegado_getTCValue (Rei dos Coins) */
  async function fetchPrice(){
    const t = startLoading(fetchBtn, fetchMsg, 'Buscando o preço de 250 TC no Rei dos Coins…');
    try{
      const d = await getTCValue();
      const price = Math.round(Number(d.valor) * 100) / 100;
      if(!(price > 0)) throw new Error('O servidor não devolveu um valor válido.');
      $('p250').value = fmt(price, 2);
      calc(); saveState(); commitParams();
      showMsg(fetchMsg, 'ok', `Valor atualizado com sucesso: ${brl(price)} por 250 TC no Rei dos Coins, em ${dateTimeStr(new Date(d.consultadoEm || Date.now()))}.`);
    }catch(e){
      showMsg(fetchMsg, 'err', 'Não foi possível buscar o Valor 250 TC. ' + (e && e.message ? e.message : 'Erro desconhecido.'));
    }finally{
      stopLoading(fetchBtn, t);
    }
  }
  fetchBtn.addEventListener('click', fetchPrice);

  /* Valor TC Servidor (Coin) — tibialegado_getAvgCoinValue (TibiaTrade, "Média Preço Venda") */
  async function fetchServerPrice(){
    const server = serverSel.value;
    const t = startLoading(fetchServBtn, fetchServMsg, `Buscando a Média Preço Venda de ${server} no TibiaTrade…`);
    try{
      const d = await getAvgCoinValue(server);
      const v = Number(d.mediaPrecoVenda);
      if(!(v > 0)) throw new Error('O servidor não devolveu um valor válido.');
      if(serverSel.value !== server) throw new Error('O servidor foi trocado durante a busca. Clique em Buscar de novo.');
      $('pServ').value = fmt(v, 0, 2);
      calc(); saveState(); commitParams();
      let text = `Valor atualizado com sucesso: ${fmt(v,0)} gold por TC (Média Preço Venda de ${d.servidor || server} no TibiaTrade).`;
      if(d.atualizadoEm){
        const when = new Date(d.atualizadoEm);
        const days = Math.floor((Date.now() - when.getTime()) / DAY_MS);
        text += ` Dados do TibiaTrade de ${dateTimeStr(when)}`;
        text += days >= 2 ? ` — atenção: há ${days} dias sem atualização para este servidor.` : '.';
      }
      showMsg(fetchServMsg, 'ok', text);
    }catch(e){
      showMsg(fetchServMsg, 'err', 'Não foi possível buscar o Valor TC Servidor. ' + (e && e.message ? e.message : 'Erro desconhecido.'));
    }finally{
      stopLoading(fetchServBtn, t);
    }
  }
  fetchServBtn.addEventListener('click', fetchServerPrice);

  /* ---------- início ---------- */
  serverSel.innerHTML = SERVERS.map(s => `<option value="${s}">${s}</option>`).join('');
  serverSel.value = DEFAULTS.server;
  numInputs.forEach(el => el.value = DEFAULTS[el.id]);
  loadLocal();
  numInputs.forEach(formatField);
  $('dataCalc').textContent = dateStr(new Date());
  renderAll();
}
