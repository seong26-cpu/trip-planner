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
