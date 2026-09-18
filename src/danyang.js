import * as cheerio from "cheerio";

const CINEMA_CD = "000151";
const BASE = "https://www.dtryx.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: `${BASE}/cinema/main.do?BrandCd=scinema&CinemaCd=${CINEMA_CD}`,
};

function toDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function fetchDaySchedule(dateStr) {
  const url = `${BASE}/cinema/showseq_list.do?BrandCd=scinema&CinemaCd=${CINEMA_CD}&PlaySDT=${dateStr}`;
  const res = await fetchWithRetry(url);
  const json = await res.json();
  return json.Showseqlist || [];
}

async function fetchMovieDetail(movieCd) {
  const url = `${BASE}/movie/view.do?MovieCd=${movieCd}`;
  const res = await fetchWithRetry(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const synopsis = $(".info2 .col2 .col").eq(0).find(".txt").text().replace(/\s+/g, " ").trim();

  let director = "";
  let actors = "";
  $(".info2 .col2 .col").eq(1).find("dl").each((_, el) => {
    const label = $(el).find("dt").text().trim();
    const value = $(el).find("dd").text().trim();
    if (label === "감독") director = value;
    if (label === "배우") actors = value;
  });

  return { synopsis, director, actors };
}

export async function fetchDanyangWeeklyMovies() {
  const movieMap = new Map();

  for (let offset = 0; offset < 7; offset++) {
    const dateStr = toDateStr(offset);
    let showings;
    try {
      showings = await fetchDaySchedule(dateStr);
    } catch {
      continue;
    }

    for (const s of showings) {
      if (!movieMap.has(s.MovieCd)) {
        movieMap.set(s.MovieCd, {
          movieCd: s.MovieCd,
          title: s.MovieNm,
          titleEng: s.MovieNmEng,
          rating: s.RatingNm,
          runningTime: s.RunningTime,
          showtimesByDate: new Map(),
        });
      }
      const movie = movieMap.get(s.MovieCd);
      if (!movie.showtimesByDate.has(dateStr)) movie.showtimesByDate.set(dateStr, []);
      movie.showtimesByDate.get(dateStr).push(s.StartTime);
    }
  }

  const movies = [...movieMap.values()];
  for (const movie of movies) {
    try {
      const detail = await fetchMovieDetail(movie.movieCd);
      Object.assign(movie, detail);
    } catch {
      movie.synopsis = "";
      movie.director = "";
      movie.actors = "";
    }
  }

  return movies;
}
