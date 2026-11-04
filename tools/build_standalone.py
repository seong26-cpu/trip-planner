#!/usr/bin/env python3
"""나의 하루 — 독립형 배포 패키지 빌드
life/ 의 앱과 Code.gs 를 바탕으로 만듭니다 (원본은 건드리지 않음).
  dist/app.html                      한 파일짜리 앱 화면 (Apps Script 제공용, 운동 사진은 원 출처에서 불러옴)
  dist/1_나의하루_서버코드.gs           사용자가 자기 Apps Script에 붙여넣는 코드 (서버 + 앱 화면 포함)
  android/app/src/main/assets/       APK에 넣을 앱 화면 + 이미지 (완전 오프라인)
"""
import base64, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIFE = os.path.join(ROOT, 'life')
DIST = os.path.join(ROOT, 'dist')
ASSETS = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'assets')

def rd(p): return open(p, encoding='utf-8').read()
def must(s, a, b, cnt=1):
    assert s.count(a) == cnt, ('패턴 불일치', a[:80], s.count(a))
    return s.replace(a, b)

HEAD_JS = r"""<script>window.__STANDALONE__=1;window.__SELF_URL__="__SELF_URL__";
(function(){try{var h=location.hash;if(h.indexOf('#connect=')===0){var u=decodeURIComponent(h.slice(9));
 if(/^https:\/\/script\.google(usercontent)?\.com\//.test(u)){var k='life.cfg',c={};try{c=JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(e){}
 c.url=u;c.at=Date.now();localStorage.setItem(k,JSON.stringify(c));localStorage.setItem('life.justConnected','1')}
 history.replaceState(null,'',location.pathname+location.search+'#home')}}catch(e){}})();</script>
"""

def build_html(mode):
    s = rd(os.path.join(LIFE, 'index.html'))
    # 외부 파일 → 한 파일로 합치기
    for js in ['ex.js', 'ex2.js', 'routines.js', 'recipes.js', 'recipes2.js', 'sites.js', 'clean.js']:
        code = rd(os.path.join(LIFE, js)).replace('</script', '<\\/script')
        s = must(s, f'<script src="{js}"></script>', '<script>\n' + code + '\n</script>')
    s = must(s, '<script src="gapi.js"></script>\n', '')
    s = re.sub(r'<link rel="manifest"[^>]*>\n?', '', s)
    s = re.sub(r'<link rel="(icon|apple-touch-icon)"[^>]*>\n?', '', s)
    s = must(s, "if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});", '')
    s = s.replace('<head>', '<head>\n' + HEAD_JS, 1)
    # 작은 그림은 파일 안에 넣기
    for m in sorted(set(re.findall(r"img/[a-z0-9\-]+\.(?:svg|jpg)", s))):
        p = os.path.join(LIFE, m)
        mime = 'image/svg+xml' if m.endswith('.svg') else 'image/jpeg'
        s = s.replace(m, f'data:{mime};base64,' + base64.b64encode(open(p, 'rb').read()).decode())
    if mode == 'web':
        # Apps Script 화면에는 운동 사진(5MB)을 넣을 수 없어 원 출처(free-exercise-db, 퍼블릭 도메인)에서 불러옴
        s = s.replace('</body>', """<script>document.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='IMG'&&!t.dataset.exf){var m=/img\\/ex\\/([A-Za-z0-9_\\-]+)_(\\d)\\.jpg/.exec(t.getAttribute('src')||'');if(m){t.dataset.exf=1;t.src='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'+m[1]+'/'+m[2]+'.jpg'}}},true);</script>\n</body>""", 1)
    return s

def to_gs_array(html):
    lines = html.split('\n')
    return 'var APP_HTML = [\n' + ',\n'.join(json.dumps(l, ensure_ascii=False).replace('\u2028', '\\u2028').replace('\u2029', '\\u2029') for l in lines) + '\n];\n'

def build_server(html):
    g = rd(os.path.join(LIFE, 'Code.gs'))
    hdr = re.search(r"const SHEETS=(\{[^\n]*?\});", rd(os.path.join(LIFE, 'index.html'))).group(1)
    g = must(g, g[:g.index('var TABS')], """/**
 * ☀️ 나의 하루 — 내 서버 (내 구글 계정 안에서만 동작)
 * ─────────────────────────────────────────────
 * 사용법 (PC, 약 10분, 처음 1번만)
 *  1. 이 코드 전체를 붙여넣고 💾 저장
 *  2. 위쪽 함수 목록이 「설치하기」인지 확인 → ▶ 실행 → 권한 검토 → 내 계정 → 고급 → 이동 → 모두 선택 → 계속
 *  3. 오른쪽 위 [배포] → [새 배포] → ⚙ [웹 앱] → 실행: 나 / 액세스: 모든 사용자 → [배포]
 *  4. 웹 앱 URL을 휴대폰에서 열기 (아이폰: 홈 화면에 추가 / 안드로이드: 앱에 연결)
 * 데이터는 내 드라이브의 「나의 하루 DB」 시트에만 저장됩니다. 수정할 부분은 없습니다.
 */
function 설치하기() {
  var ss = ss_();
  setupSheet_(ss);
  var cal = '';
  try { cal = CalendarApp.getDefaultCalendar().getName(); } catch (e) { cal = '(캘린더 확인 실패: ' + e.message + ')'; }
  try { UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true }); } catch (e) {}
  Logger.log('✅ 설치 완료! 내 드라이브에 「나의 하루 DB」 시트를 만들었어요 → ' + ss.getUrl());
  Logger.log('✅ 구글 캘린더 연결: ' + cal);
  Logger.log('👉 다음 단계: 오른쪽 위 [배포] → [새 배포] → ⚙ [웹 앱] → 실행: 나 / 액세스: 모든 사용자 → [배포] → 웹 앱 URL 복사');
}

""")
    g = must(g, "function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }", """var SHEETS = """ + hdr + """;

/* 내 드라이브의 「나의 하루 DB」 시트 (없으면 자동으로 만듦) */
function ss_() {
  var P = PropertiesService.getScriptProperties(), id = P.getProperty('SSID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
    if (!ss) ss = SpreadsheetApp.create('나의 하루 DB');
    P.setProperty('SSID', ss.getId());
    setupSheet_(ss);
  }
  return ss;
}
function setupSheet_(ss) {
  TABS.forEach(function (t) {
    var h = ['id'].concat(SHEETS[t] || []).concat(['생성', '수정']);
    var sh = ss.getSheetByName(t) || ss.insertSheet(t);
    if (sh.getLastRow() < 1) { sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold'); sh.setFrozenRows(1); }
  });
  ['Sheet1', '시트1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && s.getLastRow() < 1 && ss.getSheets().length > 1) ss.deleteSheet(s); });
}

/* 앱 설정(기기 간 동기화) — 시트 「_앱설정」에 저장 */
function cfgGet_() {
  var sh = ss_().getSheetByName('_앱설정'); if (!sh || sh.getLastColumn() < 1) return {};
  var v = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].join('');
  try { return v ? JSON.parse(v) : {}; } catch (e) { return {}; }
}
function cfgSet_(patch) {
  var o = cfgGet_(); for (var k in (patch || {})) o[k] = patch[k];
  var s = JSON.stringify(o), parts = [];
  for (var i = 0; i < s.length; i += 40000) parts.push(s.slice(i, i + 40000));
  var ss = ss_(), sh = ss.getSheetByName('_앱설정') || ss.insertSheet('_앱설정');
  sh.clear(); sh.getRange(1, 1, 1, parts.length).setNumberFormat('@').setValues([parts]);
  return true;
}
""")
    g = must(g, """function setting_(key) {
  var rows""", """function setting_(key) {
  var pv = PropertiesService.getScriptProperties().getProperty(key);
  if (pv) return String(pv).trim();
  var st = ss_().getSheetByName('설정'); if (!st) return '';
  var rows""")
    g = must(g, """function doGet(e) {
  return out_({ ok: true, app: 'life-dashboard', hasAI: !!setting_('GEMINI_API_KEY') });
}""", """/* 웹 앱 주소를 열면 → 앱 화면 */
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) return out_({ ok: true, app: 'life-dashboard' });
  var url = ScriptApp.getService().getUrl();
  var html = APP_HTML.join('\\n').replace('"__SELF_URL__"', JSON.stringify(url));
  return HtmlService.createHtmlOutput(html).setTitle('나의 하루')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}""")
    g = must(g, "if (a === 'ping') return out_({ ok: true, hasAI: !!setting_('GEMINI_API_KEY'), sheetUrl: ss_().getUrl() });",
        """if (a === 'ping') { var me = ''; try { me = Session.getEffectiveUser().getEmail(); } catch (x) {}
      return out_({ ok: true, standalone: true, email: me, hasAI: !!setting_('GEMINI_API_KEY'), hasYT: typeof YouTube !== 'undefined' || !!setting_('YOUTUBE_API_KEY'), sheetUrl: ss_().getUrl() }); }
    if (a === 'cfgGet') return out_({ ok: true, data: cfgGet_() });
    if (a === 'cfgSet') { lock.waitLock(20000); return out_({ ok: true, data: cfgSet_(req.data) }); }
    if (a === 'setKey') return out_({ ok: true, data: setKey_(req.name, req.key) });""")
    g = must(g, """function yt_(q, n) {
  if (typeof YouTube === 'undefined') return { off: true };
  var r = YouTube.Search.list('id,snippet', { q: String(q || '').slice(0, 100), maxResults: Math.min(+n || 3, 6),
    type: 'video', regionCode: 'KR', relevanceLanguage: 'ko', safeSearch: 'strict', videoEmbeddable: 'true' });""", """function yt_(q, n) {
  var o = { q: String(q || '').slice(0, 100), maxResults: Math.min(+n || 3, 6), type: 'video', regionCode: 'KR', relevanceLanguage: 'ko', safeSearch: 'strict', videoEmbeddable: 'true' };
  var r;
  if (typeof YouTube !== 'undefined') r = YouTube.Search.list('id,snippet', o);
  else {
    var key = setting_('YOUTUBE_API_KEY'); if (!key) return { off: true };
    var qs = Object.keys(o).map(function (k) { return k + '=' + encodeURIComponent(o[k]); }).join('&');
    var res = UrlFetchApp.fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&' + qs + '&key=' + encodeURIComponent(key), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { var em = ''; try { em = JSON.parse(res.getContentText()).error.message; } catch (x) {} throw new Error('YouTube 오류(' + res.getResponseCode() + '): ' + em); }
    r = JSON.parse(res.getContentText());
  }""")
    g += """
/* 앱에서 키 저장 (AI: GEMINI_API_KEY, 유튜브: YOUTUBE_API_KEY) — 내 스크립트 속성에만 저장 */
function setKey_(name, key) {
  if (['GEMINI_API_KEY', 'YOUTUBE_API_KEY'].indexOf(name) < 0) throw new Error('허용되지 않은 설정');
  var P = PropertiesService.getScriptProperties();
  key = String(key || '').trim();
  if (!key) { P.deleteProperty(name); return { ok: true, cleared: true }; }
  var old = P.getProperty(name); P.setProperty(name, key);
  try {
    if (name === 'GEMINI_API_KEY') ai_('{"ok":true} 라고만 JSON으로 답해');
    else yt_('청소', 1);
    return { ok: true };
  } catch (e) { if (old) P.setProperty(name, old); else P.deleteProperty(name); throw e; }
}

/* ===== 앱 화면 (자동 생성 — 수정하지 마세요) ===== */
""" + to_gs_array(html)
    return g

def main():
    os.makedirs(DIST, exist_ok=True)
    web = build_html('web')
    open(os.path.join(DIST, 'app.html'), 'w', encoding='utf-8').write(web)
    open(os.path.join(DIST, '1_나의하루_서버코드.gs'), 'w', encoding='utf-8').write(build_server(web))
    # APK용: 운동 사진까지 내장
    apk = build_html('apk')
    if os.path.isdir(ASSETS): shutil.rmtree(ASSETS)
    os.makedirs(os.path.join(ASSETS, 'img'))
    open(os.path.join(ASSETS, 'index.html'), 'w', encoding='utf-8').write(apk)
    shutil.copytree(os.path.join(LIFE, 'img', 'ex'), os.path.join(ASSETS, 'img', 'ex'))
    for f in ['app.html', '1_나의하루_서버코드.gs']:
        print(f, os.path.getsize(os.path.join(DIST, f)) // 1024, 'KB')
    print('assets/index.html', os.path.getsize(os.path.join(ASSETS, 'index.html')) // 1024, 'KB')

if __name__ == '__main__':
    main()
