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
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Якорим путь к расположению ЭТОГО файла, а не к process.cwd().
// CWD у seller-bot и buyer-bot разный (каждый — своя package-папка),
// поэтому если опереться на cwd, фотки seller'а уезжают в его подпапку,
// а buyer туда не смотрит.
//   packages/shared/src/storage/photos.js → подняться 4 уровня → repo root.
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_BASE_DIR = path.join(PROJECT_ROOT, 'data', 'photos');

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

  const rawBuf = Buffer.from(await fileRes.arrayBuffer());

  // Прогоняем через sharp: ужимаем до 1024px по большей стороне, JPEG q=82
  // (mozjpeg, progressive), снимаем EXIF/ICC. Telegram отдаёт оригинал
  // ~720×1280 ~90 КБ — на выходе обычно 25–35 КБ без видимой потери.
  // Если sharp по какой-то причине упал (битый файл, формат не картинка) —
  // падаем обратно на исходные байты, лучше показать большое фото, чем потерять.
  let outBuf;
  try {
    outBuf = await sharp(rawBuf, { failOn: 'none' })
      .rotate()                       // применяем EXIF-ориентацию ДО strip
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true, progressive: true })
      .toBuffer();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('sharp optimization failed, storing original:', err && err.message ? err.message : err);
    outBuf = rawBuf;
  }

  const hash = crypto.createHash('sha1').update(outBuf).digest('hex').slice(0, 16);
  const fileName = `${hash}.jpg`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), outBuf);

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
