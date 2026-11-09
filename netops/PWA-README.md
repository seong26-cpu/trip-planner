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
