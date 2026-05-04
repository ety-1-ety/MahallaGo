import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InlineKeyboard, InputFile } from 'grammy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'qr');

const SIZES = ['100', '150', '200', '300'];

function stickerPath(size) {
  return path.join(ASSETS_DIR, `sticker-${size}.pdf`);
}

export function stickerSizeKeyboard(ctx) {
  const t = ctx.t;
  const kb = new InlineKeyboard();
  for (const s of SIZES) {
    kb.text(t('seller.sticker.size_label', { size: s }), `sticker:${s}`).row();
  }
  kb.text(t('common.back'), 'set:back');
  return kb;
}

export async function showStickerMenu(ctx) {
  await ctx.editMessageText(ctx.t('seller.sticker.choose_size'), {
    parse_mode: 'Markdown',
    reply_markup: stickerSizeKeyboard(ctx),
  }).catch(() => {});
}

export async function sendSticker(ctx) {
  const size = ctx.callbackQuery?.data?.split(':')[1];
  if (!SIZES.includes(size)) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();

  const file = stickerPath(size);
  if (!fs.existsSync(file)) {
    await ctx.reply(ctx.t('seller.sticker.not_available'));
    return;
  }

  await ctx.replyWithDocument(new InputFile(file, `MahallaShop_QR_${size}x${size}mm.pdf`), {
    caption: ctx.t('seller.sticker.caption', { size }),
    parse_mode: 'Markdown',
  });
}
