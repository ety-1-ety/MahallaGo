/**
 * Получить URL фото из Telegram по file_id.
 * Telegram getFile API возвращает file_path, который собирается с
 * https://api.telegram.org/file/bot<TOKEN>/<file_path>.
 *
 * Простое in-memory кеширование на 30 минут (file_path может протухать).
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();   // file_id → { url, ts }

export async function getTelegramPhotoUrl(fileId) {
  if (!fileId) return null;

  const now = Date.now();
  const cached = cache.get(fileId);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    return cached.url;
  }

  const token = process.env.BOT_TOKEN;
  if (!token) return null;

  const apiUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const resp = await fetch(apiUrl);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.ok || !data.result?.file_path) return null;

  const fileUrl = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  cache.set(fileId, { url: fileUrl, ts: now });
  return fileUrl;
}
