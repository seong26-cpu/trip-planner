import { chromium } from "playwright";
const CITIES = [["다낭","Da Nang"],["강릉","Gangneung"],["제주","Jeju"],["삿포로","Sapporo"],["방콕","Bangkok"],["타이베이","Taipei"],["나하","Naha"],["파리","Paris"]];
const b = await chromium.launch();
const page = await b.newPage();
const errs = [];
page.on("pageerror", e => errs.push(e.message));
await page.goto("http://localhost:8080/index.html", { waitUntil: "load" });
await page.waitForTimeout(3000);
for (const [city, en] of CITIES) {
  const r = await page.evaluate(async ([city, en]) => {
    const t0 = Date.now(), log = [];
    try {
      const pk = await buildCityPack({ city, cityEn: en }, (k, s, m) => { if (s !== "run") log.push(k + ":" + s + (m ? "(" + m + ")" : "")); });
      const nf = pk.places.filter(p => p.kind === "맛집").length;
      return `OK ${Math.round((Date.now()-t0)/1000)}s 명소${pk.places.length-nf} 맛집${nf} 숙소${pk.hotels.length} 안내${pk.guide.length} center=${pk.center.lat.toFixed(3)},${pk.center.lng.toFixed(3)} warn=[${pk.warn.join(" / ")}] | ${log.join(" ")}`;
    } catch (e) { return `FAIL ${Math.round((Date.now()-t0)/1000)}s ${e.message} | ${log.join(" ")}`; }
  }, [city, en]);
  console.log(`::notice title=${city} (${en})::${r.replace(/\n/g," ").slice(0, 900)}`);
  await page.waitForTimeout(8000);
}
console.log(`::notice title=페이지 오류::${errs.length ? errs.slice(0,8).join(" / ").slice(0,900) : "없음"}`);
await b.close();
