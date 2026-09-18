const BASE = "http://www.kobis.or.kr/kobisopenapi/webservice/rest/boxoffice/searchWeeklyBoxOfficeList.json";

function lastSunday() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() - 1); // 가장 최근에 끝난 주(일~토) 기준 targetDt는 그 주의 일요일
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function normalize(title) {
  return (title || "").replace(/[\s:!?.,'"·・~()\[\]]/g, "").toLowerCase();
}

export async function fetchWeeklyBoxOffice(apiKey) {
  if (!apiKey) return new Map();

  const targetDt = lastSunday();
  const url = `${BASE}?key=${apiKey}&targetDt=${targetDt}&weekGb=0`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`KOBIS 박스오피스 조회 실패: ${res.status}`);
  const json = await res.json();

  const list = json?.boxOfficeResult?.weeklyBoxOfficeList || [];
  const map = new Map();
  for (const item of list) {
    map.set(normalize(item.movieNm), {
      rank: item.rank,
      audiAcc: item.audiAcc,
      audiCnt: item.audiCnt,
      salesAcc: item.salesAcc,
    });
  }
  return map;
}

export function lookupBoxOffice(map, title) {
  return map.get(normalize(title));
}
