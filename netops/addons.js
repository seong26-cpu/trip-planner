/* NetOps 보조 기능 (앱 본체와 따로 동작)
   __nxApply: 검토용 CONFIG → 장비에 붙여 넣는 적용용 텍스트 ('! [확인 필요]' 꼬리표 제거, 벤더별 주석 기호) */
(function () {
  'use strict';
  window.__nxApply = function (vendor, text) {
    var lines = String(text || '').split('\n');
    var cm = (vendor === 'cisco' || vendor === 'arista' || vendor === 'a10') ? '!' : '#';
    var need = 0; var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/\s+! \[확인 필요\]$/.test(l)) { l = l.replace(/\s+! \[확인 필요\]$/, ''); if (!/^\s*[!#]?\s*$/.test(l)) need++; }
      if (/^!/.test(l)) { if (cm === '!') out.push(l); else if (l.replace(/^!\s*/, '')) out.push('#' + l.slice(1)); continue; }
      out.push(l);
    }
    if (need) out.splice(1, 0, cm + ' 주의: 출처 확인 전 문법 ' + need + '줄 포함 — 검토용 파일에서 [확인 필요] 줄을 확인한 뒤 적용');
    return out.join('\n');
  };
})();
