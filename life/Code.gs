/**
 * 나만의 생활 대시보드 — 서버(Apps Script)
 * DB 구글 시트 → 확장 프로그램 → Apps Script 에서 이 코드 전체를 붙여넣으세요.
 * 수정할 부분은 없습니다. (이 스크립트가 붙어 있는 시트를 DB로 자동 사용)
 */
var TABS = ['메모', '일정', '맛집', '장소', '식재료', '레시피', '운동', '식단'];

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function setting_(key) {
  var rows = ss_().getSheetByName('설정').getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === key) return String(rows[i][1] || '').trim();
  return '';
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return out_({ ok: true, app: 'life-dashboard', hasAI: !!setting_('GEMINI_API_KEY') });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var a = req.action;
    if (a === 'ping') return out_({ ok: true, hasAI: !!setting_('GEMINI_API_KEY'), sheetUrl: ss_().getUrl() });
    if (a === 'batch') {
      lock.waitLock(25000);
      var results = (req.ops || []).map(function (op) {
        try {
          if (op.action === 'upsert') return { ok: true, data: upsert_(op.sheet, op.row) };
          if (op.action === 'remove') return { ok: true, data: remove_(op.sheet, op.id) };
          return { ok: false, error: 'bad op' };
        } catch (er) { return { ok: false, error: String(er.message || er) }; }
      });
      return out_({ ok: true, data: results });
    }
    if (a === 'listAll') return out_({ ok: true, data: listAll_() });
    if (a === 'list') return out_({ ok: true, data: list_(req.sheet) });
    if (a === 'upsert' || a === 'remove') {
      lock.waitLock(20000);
      var r = a === 'upsert' ? upsert_(req.sheet, req.row) : remove_(req.sheet, req.id);
      return out_({ ok: true, data: r });
    }
    if (a === 'calSave') return out_({ ok: true, data: calSave_(req.ev) });
    if (a === 'calDelete') return out_({ ok: true, data: calDelete_(req.eventId) });
    if (a === 'calList') return out_({ ok: true, data: calList_(req.from, req.to) });
    if (a === 'ai') return out_({ ok: true, data: ai_(req.prompt, req.image, req.mime) });
    return out_({ ok: false, error: '알 수 없는 요청: ' + a });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- 시트 DB ---------- */
function sheet_(name) {
  if (TABS.indexOf(name) < 0) throw new Error('허용되지 않은 탭: ' + name);
  return ss_().getSheetByName(name);
}

function list_(name) {
  var sh = sheet_(name);
  var v = sh.getDataRange().getValues();
  var h = v[0], res = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0]) continue;
    var o = {};
    for (var j = 0; j < h.length; j++) {
      var c = v[i][j];
      o[h[j]] = c instanceof Date ? Utilities.formatDate(c, 'Asia/Seoul', 'yyyy-MM-dd') : c;
    }
    res.push(o);
  }
  return res;
}

function listAll_() {
  var d = {};
  TABS.forEach(function (t) { d[t] = list_(t); });
  return d;
}

function upsert_(name, row) {
  var sh = sheet_(name);
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  if (!row.id) row.id = Utilities.getUuid().slice(0, 8);
  row['수정'] = now;
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  var at = -1;
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(row.id)) { at = i + 2; break; }
  if (at < 0 && !row['생성']) row['생성'] = now;
  var old = at > 0 ? sh.getRange(at, 1, 1, h.length).getValues()[0] : [];
  var vals = h.map(function (k, j) {
    if (row[k] === undefined) return old[j] === undefined ? '' : old[j];
    var v = row[k];
    return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v; // 수식 주입 방지
  });
  if (at > 0) sh.getRange(at, 1, 1, h.length).setNumberFormat('@').setValues([vals]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, h.length).setNumberFormat('@').setValues([vals]);
  var o = {}; h.forEach(function (k, j) { o[k] = vals[j]; });
  return o;
}

function remove_(name, id) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return false;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) { sh.deleteRow(i + 2); return true; }
  return false;
}

/* ---------- 구글 캘린더 ---------- */
function cal_() {
  var id = setting_('CALENDAR_ID') || 'primary';
  return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
}

function dt_(date, time) {
  var p = date.split('-'), t = (time || '00:00').split(':');
  return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]);
}

function calSave_(ev) {
  var cal = cal_(), e = null;
  if (ev.eventId) { try { e = cal.getEventById(ev.eventId); } catch (x) { e = null; } }
  var allDay = !ev.start;
  var s = dt_(ev.date, ev.start), en = ev.end ? dt_(ev.date, ev.end) : new Date(s.getTime() + 3600000);
  var opt = { location: ev.location || '', description: ev.description || '' };
  if (e) {
    e.setTitle(ev.title);
    if (allDay) e.setAllDayDate(s); else e.setTime(s, en);
    e.setLocation(opt.location); e.setDescription(opt.description);
  } else {
    e = allDay ? cal.createAllDayEvent(ev.title, s, opt) : cal.createEvent(ev.title, s, en, opt);
  }
  return e.getId();
}

function calDelete_(eventId) {
  try { var e = cal_().getEventById(eventId); if (e) e.deleteEvent(); return true; } catch (x) { return false; }
}

function calList_(from, to) {
  var evs = cal_().getEvents(dt_(from), dt_(to, '23:59'));
  return evs.slice(0, 200).map(function (e) {
    return {
      eventId: e.getId(), title: e.getTitle(), allDay: e.isAllDayEvent(),
      date: Utilities.formatDate(e.getStartTime(), 'Asia/Seoul', 'yyyy-MM-dd'),
      start: e.isAllDayEvent() ? '' : Utilities.formatDate(e.getStartTime(), 'Asia/Seoul', 'HH:mm'),
      end: e.isAllDayEvent() ? '' : Utilities.formatDate(e.getEndTime(), 'Asia/Seoul', 'HH:mm'),
      location: e.getLocation()
    };
  });
}

/* ---------- Gemini (사진 인식·AI 추천) ---------- */
function ai_(prompt, imageB64, mime) {
  var key = setting_('GEMINI_API_KEY');
  if (!key) throw new Error('설정 탭 B2에 Gemini API 키가 없습니다.');
  // 설정 탭 B3: 모델 이름 (쉼표로 여러 개 가능 → 앞에서부터 시도)
  var models = (setting_('GEMINI_MODEL') || 'gemini-3.8-flash').split(',')
    .map(function (s) { return s.trim(); }).filter(String);
  var parts = [{ text: prompt }];
  if (imageB64) parts.push({ inline_data: { mime_type: mime || 'image/jpeg', data: imageB64 } });
  var payload = JSON.stringify({
    contents: [{ parts: parts }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
  });
  var tried = {}, last = '', discovered = false;
  for (var i = 0; i < models.length && i < 6; i++) {
    var m = models[i]; if (tried[m]) continue; tried[m] = 1;
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent',
      { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-goog-api-key': key }, payload: payload });
    var code = res.getResponseCode(), body = {};
    try { body = JSON.parse(res.getContentText() || '{}'); } catch (x) {}
    if (code === 200) {
      var txt = (((body.candidates || [])[0] || {}).content || {}).parts;
      txt = txt ? txt.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('') : '';
      txt = txt.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
      try { return JSON.parse(txt); } catch (x) { return { raw: txt }; }
    }
    last = code === 429 ? '오늘 무료 AI 사용 한도를 다 썼습니다(' + m + '). 잠시 후(또는 내일) 다시 시도하세요.'
                        : 'AI 오류(' + code + ', ' + m + '): ' + (body.error && body.error.message || '');
    // 모델이 없어졌으면(404) 사용 가능한 Flash 모델을 자동으로 찾아 뒤에 추가
    if ((code === 404 || code === 429) && !discovered) { discovered = true; models = models.concat(findFlashModels_(key)); }
    if (code !== 404 && code !== 429) break;
  }
  throw new Error(last || 'AI 모델을 찾지 못했습니다. 설정 탭 B3의 모델 이름을 확인하세요.');
}

/** 이 API 키로 실제 사용 가능한 Flash 계열 모델 목록 (최신 이름순) */
function findFlashModels_(key) {
  try {
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { muteHttpExceptions: true, headers: { 'x-goog-api-key': key } });
    if (r.getResponseCode() !== 200) return [];
    return (JSON.parse(r.getContentText()).models || [])
      .filter(function (x) {
        return /flash/i.test(x.name) && !/image|tts|live|audio|embed|preview|exp/i.test(x.name) &&
          (x.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
      })
      .map(function (x) { return x.name.replace(/^models\//, ''); })
      .sort().reverse();
  } catch (x) { return []; }
}

/** 편집기에서 실행해 보면 [실행 로그]에 내 키로 쓸 수 있는 모델 목록이 나옵니다 (선택) */
function listMyModels() {
  Logger.log(findFlashModels_(setting_('GEMINI_API_KEY')).join('\n'));
}

/** 편집기에서 한 번 실행해서 권한 승인용 (선택) */
function authorizeTest() {
  Logger.log(JSON.stringify(listAll_()).slice(0, 200));
  Logger.log(cal_().getName());
}
