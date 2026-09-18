import "dotenv/config";
import { fetchDanyangWeeklyMovies } from "./danyang.js";
import { fetchYangpyeongWeeklyMovies } from "./yangpyeong.js";
import { fetchWeeklyBoxOffice, lookupBoxOffice } from "./kobis.js";
import { fetchRating } from "./tmdb.js";
import { sendTelegramMessage } from "./telegram.js";

const TOP_PICKS = 3;

function truncate(text, max = 160) {
  if (!text) return "정보 없음";
  return text.length > max ? text.slice(0, max).trim() + "…" : text;
}

function formatShowtimes(showtimesByDate) {
  return [...showtimesByDate.entries()]
    .map(([date, times]) => `${date.slice(5)} ${[...new Set(times)].sort().join(", ")}`)
    .join("\n    ");
}

async function fetchAnnotation(title, boxOfficeMap, tmdbKey) {
  const box = lookupBoxOffice(boxOfficeMap, title);
  const rating = await fetchRating(tmdbKey, title);
  return { box, rating };
}

function formatAnnotationLines({ box, rating }) {
  const lines = [];
  lines.push(
    rating
      ? `⭐ 평점 ${rating.voteAverage.toFixed(1)}/10 (TMDB ${rating.voteCount.toLocaleString()}명)`
      : "⭐ 평점 정보 없음"
  );
  lines.push(
    box
      ? `👥 전국 박스오피스 ${box.rank}위 · 이번 주 ${Number(box.audiCnt).toLocaleString()}명 · 누적 ${Number(box.audiAcc).toLocaleString()}명`
      : "👥 전국 박스오피스 순위 밖"
  );
  return lines.join("\n");
}

// 추천 점수: 박스오피스 순위(최대 100점) + TMDB 평점(최대 50점) + 편성 회차(최대 20점, 순위/평점 정보가 없을 때의 보조 지표)
function scoreMovie({ box, rating, showtimeCount }) {
  let score = 0;
  if (box) score += (11 - Number(box.rank)) * 10;
  if (rating) score += rating.voteAverage * 5;
  score += Math.min(showtimeCount || 0, 20);
  return score;
}

function reasonFor({ box, rating }) {
  const reasons = [];
  if (box) reasons.push(`박스오피스 전국 ${box.rank}위`);
  if (rating) reasons.push(`평점 ${rating.voteAverage.toFixed(1)}/10`);
  if (reasons.length === 0) reasons.push("이번 주 상영 편성");
  return reasons.join(" · ");
}

function weekRangeLabel() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(today)} ~ ${fmt(end)}`;
}

async function buildMessage() {
  const [danyangMovies, yangpyeongMovies, boxOfficeMap] = await Promise.all([
    fetchDanyangWeeklyMovies().catch((err) => {
      console.error("단양작은영화관 조회 실패:", err.message);
      return [];
    }),
    fetchYangpyeongWeeklyMovies().catch((err) => {
      console.error("양평시네마 조회 실패:", err.message);
      return [];
    }),
    fetchWeeklyBoxOffice(process.env.KOBIS_API_KEY).catch((err) => {
      console.error("KOBIS 박스오피스 조회 실패:", err.message);
      return new Map();
    }),
  ]);

  const tmdbKey = process.env.TMDB_API_KEY;

  const pool = [];
  for (const m of danyangMovies) {
    const showtimeCount = [...m.showtimesByDate.values()].reduce((sum, t) => sum + t.length, 0);
    const anno = await fetchAnnotation(m.title, boxOfficeMap, tmdbKey);
    pool.push({ movie: m, cinema: "단양작은영화관", anno, score: scoreMovie({ ...anno, showtimeCount }) });
  }
  for (const m of yangpyeongMovies) {
    const anno = await fetchAnnotation(m.title, boxOfficeMap, tmdbKey);
    pool.push({ movie: m, cinema: "양평시네마", anno, score: scoreMovie({ ...anno, showtimeCount: 0 }) });
  }

  const parts = [`🎬 이번 주 영화관 소식 (${weekRangeLabel()})`];

  const topPicks = [...pool].sort((a, b) => b.score - a.score).slice(0, TOP_PICKS);
  if (topPicks.length > 0) {
    parts.push("\n🏆 이번 주 추천 TOP" + topPicks.length);
    topPicks.forEach((p, i) => {
      parts.push(`${i + 1}. ${p.movie.title} (${p.cinema}) — ${reasonFor(p.anno)}`);
    });
    parts.push("──────────");
  }

  const byCinema = (cinemaName) => pool.filter((p) => p.cinema === cinemaName);

  parts.push("\n📍 단양작은영화관");
  if (danyangMovies.length === 0) {
    parts.push("이번 주 상영 정보를 가져오지 못했습니다.");
  }
  byCinema("단양작은영화관").forEach(({ movie: m, anno }, i) => {
    parts.push(
      [
        `\n${i + 1}. ${m.title} (${m.rating || "등급 미상"}, ${m.runningTime}분)`,
        m.director ? `🎬 감독: ${m.director}` : null,
        m.actors ? `🎭 출연: ${m.actors}` : null,
        formatAnnotationLines(anno),
        `📝 ${truncate(m.synopsis)}`,
        `🕒 상영시간\n    ${formatShowtimes(m.showtimesByDate)}`,
      ]
        .filter(Boolean)
        .join("\n")
    );
  });

  parts.push("\n\n📍 양평시네마");
  if (yangpyeongMovies.length === 0) {
    parts.push("이번 주 상영 정보를 가져오지 못했습니다.");
  }
  byCinema("양평시네마").forEach(({ movie: m, anno }, i) => {
    parts.push(
      [
        `\n${i + 1}. ${m.title} (${m.rating || "등급 미상"}, ${m.runningTime}분)`,
        m.genres?.length ? `🏷️ 장르: ${m.genres.join(", ")}` : null,
        m.director ? `🎬 감독: ${m.director}` : null,
        m.actors ? `🎭 출연: ${m.actors}` : null,
        formatAnnotationLines(anno),
        `📝 ${truncate(m.synopsis)}`,
        "🕒 양평시네마는 단관 극장이라 정확한 상영시간은 홈페이지(ypcinema.com)에서 확인하세요.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  });

  return parts.join("\n");
}

async function main() {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 환경변수가 필요합니다.");
  }

  const message = await buildMessage();
  console.log(message);
  console.log("\n--- 텔레그램 전송 중 ---");
  await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
  console.log("전송 완료");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
