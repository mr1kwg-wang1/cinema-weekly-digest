const CINEMA_ID = 91;
const API_BASE = "https://petitecine.com/api";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

const RATING_MAP = {
  KMRC0010: "전체관람가",
  KMRC0020: "12세관람가",
  KMRC0030: "15세관람가",
  KMRC0040: "청소년관람불가",
  KMRC0050: "제한상영가",
};

const GENRE_MAP = {
  GENR0010: "드라마", GENR0020: "액션", GENR0030: "애니메이션", GENR0040: "코미디",
  GENR0050: "범죄", GENR0060: "멜로/로맨스", GENR0070: "어드벤처", GENR0080: "스릴러",
  GENR0090: "공포", GENR0100: "미스터리", GENR0110: "판타지", GENR0120: "사극",
  GENR0130: "SF", GENR0140: "가족", GENR0150: "전쟁", GENR0160: "성인",
  GENR0170: "다큐멘터리", GENR0180: "기타", GENR0190: "뮤지컬", GENR0200: "서부극",
  GENR0210: "공연", GENR0220: "예술영화", GENR0230: "독립영화",
};

function stripHtml(html) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function callApi(endpoint, body) {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`양평시네마 API 호출 실패 (${endpoint}): ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

// 양평시네마는 단관(스크린 1개) 극장이라 실제로는 한 주에 1~3편만 상영된다.
// 공식 사이트에 날짜별 상영시간표 API가 없어, 최근에 등록된(SHOW_STONCE 최신순) 상영작을
// "이번 주 상영작"의 근사치로 사용한다. 더빙/자막판처럼 MVIE_CD 앞 8자리가 같은 변형은 하나로 묶는다.
export async function fetchYangpyeongWeeklyMovies({ limit = 3 } = {}) {
  const rows = await callApi("W0040.do", {
    req_cmd: "recentscreeninglist",
    use_yn: "Y",
    select_order_column: "SHOW_STONCE",
    select_order_by: "desc",
    cinema_id: CINEMA_ID,
  });

  const seenGroups = new Set();
  const deduped = [];
  for (const r of rows) {
    const groupKey = (r.MVIE_CD || "").slice(0, 8);
    if (seenGroups.has(groupKey)) continue;
    seenGroups.add(groupKey);
    deduped.push(r);
  }

  return deduped.slice(0, limit).map((r) => ({
    title: r.MVIE_NAME,
    director: r.director,
    actors: r.actor,
    genres: (r.genre || "").split(":").map((g) => GENRE_MAP[g] || g).filter(Boolean),
    rating: RATING_MAP[r.rating_code] || r.rating_code,
    runningTime: r.running_time,
    synopsis: stripHtml(r.summary),
  }));
}
