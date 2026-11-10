# NetOps 휴대폰 앱 설치 (보조 파일)

- `pwa-install.js` — 왼쪽 메뉴 '지원 → 도움말·매뉴얼' 아래에 **앱 설치** 항목과 설치 창을 붙입니다 (앱 본체와 따로 동작).
- `icons/` — 192·512·maskable·apple-touch PNG 아이콘, `manifest.webmanifest` — PNG 아이콘·검은 테마.
- 앱을 다시 빌드해 `index.html`·`manifest.webmanifest`를 덮어쓰면, 아래 줄을 `<head>`에 다시 넣고 manifest의 icons를 유지하세요.

```html
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="NetOps" />
<meta name="apple-mobile-web-app-status-bar-style" content="black" />
<script src="./pwa-install.js" defer></script>
```

## addons.js (적용용 CONFIG)
- `<script src="./addons.js"></script>` 를 앱 모듈 스크립트 **앞**에 둡니다. `window.__nxApply(vendor, text)` 제공.
- 번들에 직접 넣은 수정(다시 빌드하면 소스에 반영 필요):
  1. 내보내기 메뉴: "전체 CONFIG — 장비 적용용 (TXT)" 추가, CONFIG 창: "적용용 복사"·"적용용 저장"
  2. 구성도 선 이름표: 아래로 내려가는 선은 포트 이름을 장비 글자 밑으로(오프셋 +62), 짧은 선은 가운데 이름표를 한 줄 위로

## 운용 도구 5종 (addons.js)
원복 CONFIG · 장비↔설계 비교 · IP 계획표(CSV) · 점검 명령 · 변경 이력(이 기기 IndexedDB `netops-hist`).
번들에 넣은 연결 4곳(다시 빌드하면 소스에 반영 필요):
1. 맨 끝: `window.__nxFn={deviceConfig, configText, validate, alloc(allocateIps), parse(parseConfig), save(saveFile)}`
2. DraftProvider 본문: `window.__nxCtx={topo: view, raw: activeTopo, updateTopo}`
3. DraftProvider save(): `window.__nxOnSave && window.__nxOnSave(before, after, report)`
4. 구성도 도구 막대: `<button id="btn-tools" onClick={() => window.__nxTools?.open()}>운용 도구</button>`
왼쪽 메뉴 '운용 작업 → 운용 도구 5종'은 addons.js가 `#nav-tasks` 뒤에 붙입니다.

## 화면 보정 (ui-fix.js) — 밝은 화면·겹침 해결·경계선 크기 조절
- `index.html` `<head>`에서 `pwa-install.js` **앞**에 `<script src="./ui-fix.js"></script>` (화면 깜빡임 없이 먼저 테마 적용). `theme-color` 기본 `#ffffff`.
- 테마: 기본 **밝게**. 위쪽 도움말(?) 왼쪽 `#btn-theme` → 밝게 → 어둡게 → 시스템 순환. `localStorage nx-theme`, `<html data-theme>`에 실제 값 지정. `window.netopsTheme('light'|'dark'|'system')`.
- 배치(`html .canvas-grid` + `!important`로 기존 규칙보다 우선): >1100px 팔레트|구성도|속성 3칸, 641–1100px 팔레트|구성도 + 속성은 아래 한 줄, ≤640px 한 줄씩(팔레트 높이 제한 → 구성도 → 속성).
- 경계선: `.nx-split.l`(팔레트 오른쪽), `.nx-split.r`(속성 왼쪽, 3칸일 때만), `#nx-hsplit`(휴대폰에서 팔레트 높이). 마우스·터치·키보드(←→), 두 번 누르면 기본값. 폭은 `--nx-pal`/`--nx-props`/`--nx-palh` (localStorage `nx-w-*`), 구성도 칸 최소 360px 유지.
- `pwa-install.js` 설치 창 어두운 색은 `:root[data-theme=dark]` 기준으로 변경. `sw.js` CACHE `netops-v9`, SHELL에 `ui-fix.js` 추가.
