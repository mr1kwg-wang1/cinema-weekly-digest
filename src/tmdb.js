const SEARCH_URL = "https://api.themoviedb.org/3/search/movie";

export async function fetchRating(apiKey, title) {
  if (!apiKey || !title) return null;

  try {
    const isV4Token = apiKey.startsWith("eyJ");
    const params = new URLSearchParams({ query: title, language: "ko-KR", include_adult: "true" });
    if (!isV4Token) params.set("api_key", apiKey);
    const url = `${SEARCH_URL}?${params.toString()}`;
    const res = await fetch(url, {
      headers: isV4Token ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return null;
    const json = await res.json();
    const top = json.results?.[0];
    if (!top || !top.vote_count) return null;
    return { voteAverage: top.vote_average, voteCount: top.vote_count };
  } catch {
    return null;
  }
}
