/* =====================================================================
   나의 하루 — 구글 직접 연동 (각 사용자 본인의 구글 계정·드라이브만 사용)
   - 데이터: 사용자 드라이브에 「나의 하루 DB」 시트를 자동 생성해 저장
   - 설정: 사용자 드라이브의 「나의 하루 설정.json」 파일 (기기 간 동기화)
   - 캘린더·AI 키: 사용자가 원할 때만 연결 (선택)
   관리자(앱 배포자)는 아래 CLIENT_ID 하나만 넣으면 됩니다. (서버·DB 없음)
   ===================================================================== */
window.GCONF = Object.assign({
  CLIENT_ID: '',          // Google Cloud → OAuth 클라이언트 ID (웹 애플리케이션)
  YT_KEY: ''              // (선택) YouTube Data API 키 — 클리닝 영상 앱 안 재생용
}, window.GCONF || {});

(function () {
  const S_BASE = 'openid email profile https://www.googleapis.com/auth/drive.file';
  const S_CAL = 'https://www.googleapis.com/auth/calendar.events';
  const SS_NAME = '나의 하루 DB', CF_NAME = '나의 하루 설정.json';
  const L = { get(k, d) { try { const v = localStorage.getItem('life.' + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
              set(k, v) { try { localStorage.setItem('life.' + k, JSON.stringify(v)) } catch (e) {} } };
  const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul' } catch (e) { return 'Asia/Seoul' } })();
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const stamp = () => { const d = new Date(); return ymd(d) + ' ' + hm(d) };
  const plusDay = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d) };
  const isIOSStandalone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && (navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

  let tok = L.get('gtok', null);          // {t, exp, scope}
  let tc = null, waiters = [], gsiP = null;

  function loadGsi() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gsiP) return gsiP;
    gsiP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = ok; s.onerror = () => { gsiP = null; no(new Error('구글 로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')) }; document.head.appendChild(s) });
    return gsiP;
  }
  function saveTok(r) {
    const prev = tok && tok.scope ? tok.scope.split(' ') : [];
    const sc = new Set(prev.concat(String(r.scope || '').split(' ')).filter(Boolean));
    tok = { t: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000 - 60000, scope: [...sc].join(' ') };
    L.set('gtok', tok);
  }
  const has = s => !!(tok && tok.scope && tok.scope.split(' ').includes(s));
  const valid = () => !!(tok && tok.t && tok.exp > Date.now());

  /* iOS 홈 화면 앱은 팝업이 불안정해서 페이지 이동(리디렉트) 방식으로 로그인 */
  function redirectLogin(scope, prompt) {
    const p = new URLSearchParams({ client_id: GCONF.CLIENT_ID, redirect_uri: redirectUri(), response_type: 'token', scope,
      include_granted_scopes: 'true', state: 'gauth:' + (location.hash.slice(1) || 'home') });
    if (prompt) p.set('prompt', prompt);
    const em = (L.get('gprof', {}) || {}).email; if (em) p.set('login_hint', em);
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
    return new Promise(() => {});
  }
  /* 리디렉트로 돌아왔을 때 주소의 #access_token=… 을 읽어서 저장 */
  function takeRedirect() {
    const h = location.hash;
    if (!/access_token=|error=/.test(h)) return false;
    const p = new URLSearchParams(h.slice(1)); const st = p.get('state') || '';
    if (!st.startsWith('gauth:')) return false;
    if (p.get('access_token')) { saveTok({ access_token: p.get('access_token'), expires_in: p.get('expires_in'), scope: p.get('scope') }); L.set('gjustAuthed', 1) }
    else L.set('gauthErr', p.get('error') || 'error');
    history.replaceState(null, '', location.pathname + location.search + '#' + st.slice(6));
    return true;
  }

  /** 구글 권한 요청. extra: 추가로 받을 권한(캘린더 등). quiet: 이미 허용한 사람은 창이 잠깐 떴다 닫힘 */
  async function authorize(extra, quiet) {
    if (!GCONF.CLIENT_ID) throw new Error('앱 관리자가 아직 구글 연결 설정(CLIENT_ID)을 하지 않았어요.');
    const scope = [S_BASE].concat(extra ? [extra] : []).join(' ');
    if (isIOSStandalone()) return redirectLogin(scope, quiet ? 'none' : (extra ? '' : 'select_account'));
    await loadGsi();
    return new Promise((ok, no) => {
      tc = google.accounts.oauth2.initTokenClient({
        client_id: GCONF.CLIENT_ID, scope, include_granted_scopes: true,
        callback: r => { if (r.error) return no(new Error(r.error === 'access_denied' ? '구글 연결을 취소했어요.' : '구글 연결 실패: ' + r.error)); saveTok(r);
          if (extra && !google.accounts.oauth2.hasGrantedAllScopes(r, extra)) return no(new Error('권한 화면에서 해당 항목을 체크하지 않았어요. 다시 눌러 「모두 선택」 후 계속을 눌러 주세요.'));
          ok(tok) },
        error_callback: e => no(Object.assign(new Error(e && e.type === 'popup_failed_to_open' ? '팝업이 차단됐어요. 화면을 한 번 누른 뒤 다시 시도해 주세요.' : '구글 연결 창이 닫혔어요.'), { popup: 1 }))
      });
      const em = (L.get('gprof', {}) || {}).email;
      tc.requestAccessToken(Object.assign({ prompt: quiet ? '' : (extra ? '' : 'select_account') }, em ? { hint: em } : {}));
    });
  }

  /* 토큰은 1시간마다 만료 → 사용자가 화면을 누를 때(팝업 허용 시점) 조용히 갱신 */
  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    const extra = has(S_CAL) ? S_CAL : '';
    refreshing = authorize(extra, true).then(t => { refreshing = null; const w = waiters; waiters = []; w.forEach(f => f.ok(t)); window.dispatchEvent(new Event('gtoken')); return t },
      e => { refreshing = null; throw e });
    return refreshing;
  }
  document.addEventListener('pointerdown', () => { if (!isIOSStandalone() && GAPI.on() && tok && !valid() && !refreshing) refresh().catch(() => {}) }, true);

  async function token() {
    if (valid()) return tok.t;
    if (!tok) throw new Error('구글 계정이 연결되지 않았어요 (더보기 → 설정 → 구글 연결).');
    throw Object.assign(new Error('구글 연결이 만료됐어요 — 화면을 한 번 누르면 자동으로 다시 연결돼요.'), { expired: 1 });
  }

  async function g(url, opt = {}) {
    const t = await token();
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + t }, opt.body && typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {}, opt.headers || {}) }));
    if (r.status === 401) { tok.exp = 0; L.set('gtok', tok); throw Object.assign(new Error('구글 연결이 만료됐어요 — 화면을 한 번 누르면 자동으로 다시 연결돼요.'), { expired: 1 }) }
    if (r.status === 204) return null;
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null } catch (e) { j = { raw: txt } }
    if (!r.ok) { const m = (j && j.error && (j.error.message || j.error)) || r.statusText; throw Object.assign(new Error('구글 오류(' + r.status + '): ' + m), { status: r.status }) }
    return j;
  }
  const SH = 'https://sheets.googleapis.com/v4/spreadsheets/', DR = 'https://www.googleapis.com/drive/v3/files';

  /* ---------------- 시트 DB ---------------- */
  const SHT = () => (typeof SHEETS !== 'undefined' ? SHEETS : {});
  const CF = () => (typeof CFG !== 'undefined' ? CFG : {});
  const tabs = () => Object.keys(SHT());
  const headerOf = t => ['id'].concat(SHT()[t] || []).concat(['생성', '수정']);
  async function findFile(name, mime) {
    const q = `name='${name.replace(/'/g, "\\'")}' and trashed=false` + (mime ? ` and mimeType='${mime}'` : '');
    const r = await g(DR + '?spaces=drive&orderBy=createdTime&fields=files(id,name)&q=' + encodeURIComponent(q));
    return (r.files || [])[0] || null;
  }
  async function ssId() {
    let id = L.get('gsid', '');
    if (id) return id;
    const f = await findFile(SS_NAME, 'application/vnd.google-apps.spreadsheet');
    if (f) id = f.id;
    else {
      const body = { properties: { title: SS_NAME, locale: 'ko_KR', timeZone: TZ },
        sheets: tabs().map(t => ({ properties: { title: t, gridProperties: { frozenRowCount: 1 } },
          data: [{ startRow: 0, startColumn: 0, rowData: [{ values: headerOf(t).map(h => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })) }] }] })) };
      id = (await g(SH.slice(0, -1), { method: 'POST', body: JSON.stringify(body) })).spreadsheetId;
    }
    L.set('gsid', id); return id;
  }
  /* 앱에 새 탭이 생겼으면 시트에도 탭 추가 */
  async function ensureTabs(id, have) {
    const miss = tabs().filter(t => !have.includes(t)); if (!miss.length) return;
    await g(SH + id + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: miss.map(t => ({ addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } } })) }) });
    await g(SH + id + '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: miss.map(t => ({ range: `'${t}'!A1`, values: [headerOf(t)] })) }) });
  }
  async function readTabs(names) {
    const id = await ssId();
    let r;
    try { r = await g(SH + id + '/values:batchGet?valueRenderOption=FORMATTED_VALUE&' + names.map(n => 'ranges=' + encodeURIComponent(`'${n}'`)).join('&')) }
    catch (e) {
      if (e.status === 404) { L.set('gsid', ''); throw new Error('드라이브에서 「나의 하루 DB」 시트를 찾지 못했어요(삭제됨). 다시 동기화하면 새로 만들어요.') }
      if (e.status === 400 && /Unable to parse range/i.test(e.message)) { const m = await g(SH + id + '?fields=sheets.properties.title'); await ensureTabs(id, m.sheets.map(s => s.properties.title)); return readTabs(names) }
      throw e;
    }
    const out = {};
    (r.valueRanges || []).forEach((vr, i) => { const v = vr.values || []; const h = (v[0] && v[0].length ? v[0] : headerOf(names[i])).map(String);
      out[names[i]] = { h, rows: v.slice(1).filter(x => x[0]).map(x => { const o = {}; h.forEach((k, j) => o[k] = x[j] === undefined ? '' : x[j]); return o }) } });
    return out;
  }
  async function listAll() { const T = tabs(), d = await readTabs(T), o = {}; T.forEach(t => o[t] = d[t].rows); return o }
  const cell = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
  async function batch(ops) {
    const names = [...new Set(ops.map(o => o.sheet))].filter(t => tabs().includes(t));
    const d = await readTabs(names), now = stamp();
    const res = ops.map(op => {
      const T = d[op.sheet]; if (!T) return { ok: false, error: '허용되지 않은 탭: ' + op.sheet };
      if (op.action === 'remove') { const n = T.rows.length; T.rows = T.rows.filter(x => String(x.id) !== String(op.id)); return { ok: true, data: T.rows.length < n } }
      if (op.action !== 'upsert') return { ok: false, error: 'bad op' };
      const row = Object.assign({}, op.row); if (!row.id) row.id = Math.random().toString(36).slice(2, 10);
      Object.keys(row).forEach(k => { if (k.charAt(0) !== '_' && !T.h.includes(k)) T.h.push(k) });
      const at = T.rows.findIndex(x => String(x.id) === String(row.id)); const old = at >= 0 ? T.rows[at] : {};
      if (at < 0 && !row['생성']) row['생성'] = now; row['수정'] = now;
      const o = {}; T.h.forEach(k => o[k] = row[k] === undefined ? (old[k] === undefined ? '' : old[k]) : cell(row[k]));
      if (at >= 0) T.rows[at] = o; else T.rows.push(o);
      return { ok: true, data: o };
    });
    const id = await ssId();
    await g(SH + id + '/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges: names.map(n => `'${n}'`) }) });
    await g(SH + id + '/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW',
      data: names.map(n => ({ range: `'${n}'!A1`, values: [d[n].h].concat(d[n].rows.map(r => d[n].h.map(k => r[k] === undefined ? '' : r[k]))) })) }) });
    return res;
  }

  /* ---------------- 설정 파일 (기기 간 동기화) ---------------- */
  let cfCache = null;
  async function cfgId(create) {
    let id = L.get('gcfid', '');
    if (id) return id;
    const f = await findFile(CF_NAME); if (f) { L.set('gcfid', f.id); return f.id }
    if (!create) return '';
    const r = await g(DR + '?fields=id', { method: 'POST', body: JSON.stringify({ name: CF_NAME, mimeType: 'application/json', description: '나의 하루 앱 설정 (지우면 다른 기기 설정 동기화가 초기화돼요)' }) });
    L.set('gcfid', r.id); return r.id;
  }
  async function cfgRead() {
    const id = await cfgId(false); if (!id) return (cfCache = null);
    try { cfCache = await g(DR + '/' + id + '?alt=media'); if (cfCache && cfCache.raw !== undefined) cfCache = {} }
    catch (e) { if (e.status === 404) { L.set('gcfid', ''); return (cfCache = null) } throw e }
    return cfCache;
  }
  async function cfgWrite(patch) {
    const id = await cfgId(true);
    if (!cfCache) { try { cfCache = await g(DR + '/' + id + '?alt=media') || {} } catch (e) { cfCache = {} } if (cfCache.raw !== undefined) cfCache = {} }
    Object.assign(cfCache, patch);
    await g('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', { method: 'PATCH', body: JSON.stringify(cfCache) });
  }

  /* ---------------- 구글 캘린더 (선택) ---------------- */
  const CA = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  function needCal() { if (!has(S_CAL)) throw Object.assign(new Error('구글 캘린더가 아직 연결되지 않았어요 (더보기 → 설정 → 구글 연결 → 캘린더 연결).'), { nocal: 1 }) }
  async function calSave(ev) {
    needCal();
    const endDate = ev.endDate && ev.endDate > ev.date ? ev.endDate : '';
    const b = { summary: ev.title, location: ev.location || '' }; if (!ev.keepDesc) b.description = ev.description || '';
    if (!ev.start) { b.start = { date: ev.date }; b.end = { date: plusDay(endDate || ev.date, 1) } }
    else {
      const s = new Date(ev.date + 'T' + ev.start); let e = ev.end ? new Date((endDate || ev.date) + 'T' + ev.end) : new Date(new Date((endDate || ev.date) + 'T' + ev.start).getTime() + 3600000);
      if (!(e > s)) e = new Date(s.getTime() + 3600000);
      const f = d => ymd(d) + 'T' + hm(d) + ':00';
      b.start = { dateTime: f(s), timeZone: TZ }; b.end = { dateTime: f(e), timeZone: TZ };
    }
    if (ev.eventId && !/@/.test(ev.eventId)) {
      try { return (await g(CA + '/' + encodeURIComponent(ev.eventId), { method: 'PATCH', body: JSON.stringify(b) })).id }
      catch (e) { if (e.status !== 404 && e.status !== 410) throw e }
    }
    return (await g(CA, { method: 'POST', body: JSON.stringify(b) })).id;
  }
  async function calDelete(id) {
    needCal(); if (!id || /@/.test(id)) return false;
    try { await g(CA + '/' + encodeURIComponent(id), { method: 'DELETE' }); return true } catch (e) { if (e.status === 404 || e.status === 410) return false; throw e }
  }
  async function calList(from, to) {
    needCal();
    const p = new URLSearchParams({ timeMin: new Date(from + 'T00:00').toISOString(), timeMax: new Date(to + 'T23:59:59').toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: '200', timeZone: TZ });
    const r = await g(CA + '?' + p);
    return (r.items || []).filter(e => e.status !== 'cancelled').map(e => {
      const ad = !!(e.start && e.start.date);
      const sd = ad ? e.start.date : String(e.start.dateTime).slice(0, 10);
      const ed = ad ? plusDay(e.end.date, -1) : (() => { const x = new Date(new Date(e.end.dateTime).getTime() - 60000); return ymd(x) })();
      return { eventId: e.id, title: e.summary || '(제목 없음)', allDay: ad, date: sd,
        start: ad ? '' : hm(new Date(e.start.dateTime)), end: ad ? '' : hm(new Date(e.end.dateTime)),
        endDate: ed < sd ? sd : ed, description: String(e.description || '').slice(0, 1500), location: e.location || '' };
    });
  }

  /* ---------------- Gemini AI (사용자 본인 키) ---------------- */
  async function flashModels(key) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
      if (!r.ok) return [];
      return ((await r.json()).models || []).filter(x => /flash/i.test(x.name) && !/image|tts|live|audio|embed|preview|exp/i.test(x.name) && (x.supportedGenerationMethods || []).includes('generateContent'))
        .map(x => x.name.replace(/^models\//, '')).sort().reverse();
    } catch (e) { return [] }
  }
  async function ai(prompt, image, mime, keyArg) {
    const key = keyArg || CF().gkey;
    if (!key) throw new Error('AI 키가 없어요 — 더보기 → 설정 → 구글 연결 → 「AI 키」에 무료 Gemini 키를 넣어 주세요.');
    let models = [L.get('gmodel', '')].filter(Boolean), found = false;
    if (!models.length) { models = await flashModels(key); found = true; if (!models.length) throw new Error('AI 키가 올바르지 않거나 사용할 수 있는 모델이 없어요. 키를 다시 확인해 주세요.') }
    const parts = [{ text: prompt }]; if (image) parts.push({ inline_data: { mime_type: mime || 'image/jpeg', data: image } });
    const tried = {}, noFast = {}; let last = '';
    for (let i = 0; i < models.length && i < 8; i++) {
      const m = models[i];
      const gc = { responseMimeType: 'application/json', temperature: 0.4 };
      if (!noFast[m] && /flash/i.test(m)) { if (/gemini-2\.5/i.test(m)) gc.thinkingConfig = { thinkingBudget: 0 }; else if (/gemini-[3-9]/i.test(m)) gc.thinkingConfig = { thinkingLevel: 'low' } }
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts }], generationConfig: gc }) });
      let b = {}; try { b = await r.json() } catch (e) {}
      if (r.ok) {
        L.set('gmodel', m);
        let t = (((b.candidates || [])[0] || {}).content || {}).parts; t = t ? t.filter(p => !p.thought).map(p => p.text || '').join('') : '';
        t = t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        try { return JSON.parse(t) } catch (e) { return { raw: t } }
      }
      const msg = (b.error && b.error.message) || '';
      if (r.status === 400 && !noFast[m] && /think/i.test(msg)) { noFast[m] = 1; i--; continue }
      if ((r.status === 503 || r.status === 500) && !tried[m]) { tried[m] = 1; await new Promise(z => setTimeout(z, 3000)); i--; continue }
      if (r.status === 400 && /api key/i.test(msg)) throw new Error('AI 키가 올바르지 않아요. 설정에서 키를 다시 붙여넣어 주세요.');
      last = r.status === 429 ? '오늘 무료 AI 사용 한도를 다 썼어요. 잠시 후(또는 내일) 다시 시도하세요.' : 'AI 오류(' + r.status + ', ' + m + '): ' + msg;
      const move = [404, 429, 500, 503].includes(r.status);
      if (move && !found) { found = true; L.set('gmodel', ''); models = models.concat(await flashModels(key)) }
      if (!move) break;
    }
    throw new Error(last || 'AI 모델을 찾지 못했어요.');
  }

  /* ---------------- 유튜브 검색 (앱 공용 키, 선택) ---------------- */
  async function yt(q, n) {
    if (!GCONF.YT_KEY) return { off: true };
    const p = new URLSearchParams({ part: 'snippet', q: String(q || '').slice(0, 100), maxResults: String(Math.min(+n || 3, 6)), type: 'video',
      regionCode: 'KR', relevanceLanguage: 'ko', safeSearch: 'strict', videoEmbeddable: 'true', key: GCONF.YT_KEY });
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + p); const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || ('유튜브 오류 ' + r.status));
    return { items: (j.items || []).map(it => ({ id: it.id.videoId, t: it.snippet.title, ch: it.snippet.channelTitle, d: String(it.snippet.description || '').slice(0, 120) })) };
  }

  async function profile() {
    const p = await g('https://www.googleapis.com/oauth2/v3/userinfo');
    const o = { email: p.email || '', displayName: p.name || p.email || '', photo: p.picture || '' }; L.set('gprof', o); return o;
  }

  const GAPI = window.GAPI = {
    S_CAL, TZ, ready: () => !!GCONF.CLIENT_ID, on: () => CF().url === 'google',
    has, valid, takeRedirect, authorize, refresh, profile, ssId, cfgRead, cfgWrite,
    calOn: () => has(S_CAL),
    sheetUrl: () => { const id = L.get('gsid', ''); return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '' },
    user: () => L.get('gprof', null),
    async revoke() { try { if (tok && tok.t) await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(tok.t), { method: 'POST' }) } catch (e) {}
      tok = null; ['gtok', 'gprof', 'gsid', 'gcfid', 'gmodel'].forEach(k => localStorage.removeItem('life.' + k)); cfCache = null },
    async call(action, b) {
      switch (action) {
        case 'ping': await ssId(); return { ok: true, hasAI: !!CF().gkey, sheetUrl: GAPI.sheetUrl() };
        case 'listAll': return listAll();
        case 'batch': return batch(b.ops || []);
        case 'calSave': return calSave(b.ev);
        case 'calDelete': return calDelete(b.eventId);
        case 'calList': return calList(b.from, b.to);
        case 'ai': return ai(b.prompt, b.image, b.mime);
        case 'yt': return yt(b.q, b.n);
        default: throw new Error('알 수 없는 요청: ' + action);
      }
    },
    testAI: key => ai('{"ok":true} 라고만 JSON으로 답해', null, null, key),
    ios: isIOSStandalone
  };
  takeRedirect();
})();
