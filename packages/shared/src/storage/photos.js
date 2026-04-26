// ─────────────────────────────────────────────────────────────────
// Фотографии Telegram → локальный диск.
//
// Telegram file_id привязан к боту-загрузчику. Чтобы buyer-bot мог
// показать фото товара, загруженного seller-bot'ом, мы скачиваем байты
// сразу после загрузки и кладём в общий каталог `data/photos/`.
// Имя файла — sha1 содержимого (детерминированно, дедупликация бесплатно).
// ─────────────────────────────────────────────────────────────────

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_BASE_DIR = path.resolve(process.cwd(), 'data', 'photos');

/**
 * Возвращает абсолютный путь к каталогу фото.
 * Можно переопределить через env PHOTO_DIR.
 */
export function getPhotoDir() {
  return process.env.PHOTO_DIR || DEFAULT_BASE_DIR;
}

/**
 * Скачивает фото из Telegram по file_id и сохраняет на диск.
 *
 * @param {Object} opts
 * @param {string} opts.token   — bot token боту, которому принадлежит file_id
 * @param {string} opts.fileId  — Telegram file_id
 * @param {string} [opts.baseDir] — куда сохранять (по умолчанию getPhotoDir())
 * @returns {Promise<string>} имя файла (относительно baseDir), например 'a3f4b2c1.jpg'
 */
export async function downloadTelegramPhoto({ token, fileId, baseDir }) {
  if (!token || !fileId) throw new Error('downloadTelegramPhoto: token и fileId обязательны');
  const dir = baseDir || getPhotoDir();

  const metaRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const meta = await metaRes.json();
  if (!meta.ok) throw new Error(`getFile failed: ${meta.description || metaRes.status}`);

  const filePath = meta.result.file_path;
  if (!filePath) throw new Error('getFile: file_path missing');

  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileRes.ok) throw new Error(`download failed: ${fileRes.status}`);

  const buf = Buffer.from(await fileRes.arrayBuffer());
  const ext = (path.extname(filePath) || '.jpg').toLowerCase();
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  const fileName = `${hash}${ext}`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), buf);

  return fileName;
}

/**
 * Возвращает абсолютный путь к ранее сохранённому фото.
 * Если фото нет — null.
 */
export async function resolvePhotoPath(fileName) {
  if (!fileName) return null;
  const full = path.join(getPhotoDir(), fileName);
  try {
    await fs.access(full);
    return full;
  } catch {
    return null;
  }
}
