import "dotenv/config";
import { fetchDanyangWeeklyMovies } from "./danyang.js";
import { fetchYangpyeongWeeklyMovies } from "./yangpyeong.js";
import { fetchWeeklyBoxOffice, lookupBoxOffice } from "./kobis.js";
import { fetchRating } from "./tmdb.js";
import { sendTelegramMessage } from "./telegram.js";

function truncate(text, max = 160) {
  if (!text) return "정보 없음";
  return text.length > max ? text.slice(0, max).trim() + "…" : text;
}

function formatShowtimes(showtimesByDate) {
  return [...showtimesByDate.entries()]
    .map(([date, times]) => `${date.slice(5)} ${[...new Set(times)].sort().join(", ")}`)
    .join("\n    ");
}

async function annotate(title, boxOfficeMap, tmdbKey) {
  const box = lookupBoxOffice(boxOfficeMap, title);
  const rating = await fetchRating(tmdbKey, title);

  const lines = [];
  if (rating) {
    lines.push(`⭐ 평점 ${rating.voteAverage.toFixed(1)}/10 (TMDB ${rating.voteCount.toLocaleString()}명)`);
  } else {
    lines.push("⭐ 평점 정보 없음");
  }
  if (box) {
    lines.push(`👥 전국 박스오피스 ${box.rank}위 · 이번 주 ${Number(box.audiCnt).toLocaleString()}명 · 누적 ${Number(box.audiAcc).toLocaleString()}명`);
  } else {
    lines.push("👥 전국 박스오피스 순위 밖");
  }
  return lines.join("\n");
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

  const parts = [`🎬 이번 주 영화관 소식 (${weekRangeLabel()})`];

  parts.push("\n📍 단양작은영화관");
  if (danyangMovies.length === 0) {
    parts.push("이번 주 상영 정보를 가져오지 못했습니다.");
  }
  for (const [i, m] of danyangMovies.entries()) {
    const anno = await annotate(m.title, boxOfficeMap, process.env.TMDB_API_KEY);
    parts.push(
      [
        `\n${i + 1}. ${m.title} (${m.rating || "등급 미상"}, ${m.runningTime}분)`,
        m.director ? `🎬 감독: ${m.director}` : null,
        m.actors ? `🎭 출연: ${m.actors}` : null,
        anno,
        `📝 ${truncate(m.synopsis)}`,
        `🕒 상영시간\n    ${formatShowtimes(m.showtimesByDate)}`,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  parts.push("\n\n📍 양평시네마");
  if (yangpyeongMovies.length === 0) {
    parts.push("이번 주 상영 정보를 가져오지 못했습니다.");
  }
  for (const [i, m] of yangpyeongMovies.entries()) {
    const anno = await annotate(m.title, boxOfficeMap, process.env.TMDB_API_KEY);
    parts.push(
      [
        `\n${i + 1}. ${m.title} (${m.rating || "등급 미상"}, ${m.runningTime}분)`,
        m.genres?.length ? `🏷️ 장르: ${m.genres.join(", ")}` : null,
        m.director ? `🎬 감독: ${m.director}` : null,
        m.actors ? `🎭 출연: ${m.actors}` : null,
        anno,
        `📝 ${truncate(m.synopsis)}`,
        "🕒 양평시네마는 단관 극장이라 정확한 상영시간은 홈페이지(ypcinema.com)에서 확인하세요.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

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
