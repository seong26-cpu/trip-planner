/* 여행 올인원 플래너 서비스워커: 앱 화면은 최신 우선(network-first), 라이브러리는 캐시 우선. 지도 타일·로그인·DB는 캐시하지 않음 */
const V="tp-v6";
const SHELL=["./","index.html","manifest.webmanifest","firebase-config.js","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  if(/tile\.openstreetmap|googleapis\.com\/(identitytoolkit|google\.firestore)|firestore\.googleapis|securetoken|accounts\.google/.test(u.href))return;
  const lib=/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com/.test(u.href);
  if(lib){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(e.request,cp));return res})));return}
  if(u.origin===location.origin){e.respondWith(fetch(e.request).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(e.request,cp));return res}).catch(()=>caches.match(e.request).then(r=>r||caches.match("index.html"))))}
});
