-- ─────────────────────────────────────────────────────────────────
-- catalog.products: photo_path — относительный путь к скачанному файлу.
--
-- Telegram file_id привязан к боту-загрузчику. seller-bot после получения
-- фото сохраняет байты в data/photos/<sha1>.jpg и пишет имя сюда.
-- buyer-bot читает фото с диска (InputFile.fromPath).
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE catalog.products
  ADD COLUMN IF NOT EXISTS photo_path TEXT NULL;

COMMENT ON COLUMN catalog.products.photo_path IS 'Имя файла в общем хранилище data/photos/. Используется для cross-bot отображения фото';
