const MAX_LEN = 4000;

function splitMessage(text) {
  const chunks = [];
  let rest = text;
  while (rest.length > MAX_LEN) {
    let cut = rest.lastIndexOf("\n\n", MAX_LEN);
    if (cut <= 0) cut = MAX_LEN;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  for (const chunk of splitMessage(text)) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      }),
    });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(`텔레그램 전송 실패: ${json.description || res.status}`);
    }
  }
}
