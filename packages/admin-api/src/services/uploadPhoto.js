import { optimizeAndSave } from '@mahallago/shared';

// ─────────────────────────────────────────────────────────────────
// HTTP multipart photo upload → sharp pipeline → SHA1-named .jpg
// Используется seller Mini App'ом при добавлении/редактировании товара.
//
// Контракт: фронт шлёт `multipart/form-data` с полем 'photo' (одна картинка).
// Лимит размера и MIME-проверка — здесь же. Возврат: имя файла, которое
// потом кладётся в `catalog.products.photo_path`.
// ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',  // некоторые iPhone-ы шлют HEIC; sharp его сожрёт
]);

const MAX_BYTES = 6 * 1024 * 1024;  // 6 МБ

/**
 * Принимает multipart-файл (стрим от @fastify/multipart) и сохраняет на диск.
 *
 * @param {AsyncIterable | { file: AsyncIterable, mimetype: string, filename: string }} part
 *        — результат `await request.file()` от @fastify/multipart
 * @returns {Promise<{ filename: string }>}  имя сохранённого файла
 * @throws  с .code:
 *   - NO_FILE         — поле photo не пришло
 *   - UNSUPPORTED_MIME — не картинка
 *   - FILE_TOO_LARGE   — > 6 МБ
 */
export async function savePhotoUpload(part) {
  if (!part || !part.file) {
    throw makeErr('NO_FILE', 'photo field missing');
  }
  const mime = (part.mimetype || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    // sliently consume to avoid backpressure issues
    try { for await (const _ of part.file) { /* drain */ } } catch { /* ignore */ }
    throw makeErr('UNSUPPORTED_MIME', `mime: ${mime}`);
  }

  // Собираем буфер с раннего отказа при превышении лимита.
  const chunks = [];
  let total = 0;
  for await (const chunk of part.file) {
    total += chunk.length;
    if (total > MAX_BYTES) {
      throw makeErr('FILE_TOO_LARGE', `> ${MAX_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  if (total === 0) {
    throw makeErr('NO_FILE', 'empty stream');
  }

  const rawBuf = Buffer.concat(chunks, total);
  const filename = await optimizeAndSave(rawBuf);
  return { filename };
}

function makeErr(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
