// Импортирует все .js-модули backend-пакетов и shared. Ловит:
//  - syntax errors
//  - сломанные импорты (missing/circular)
//  - top-level throw'ы которые не зависят от env (напр. config validation
//    падает из-за отсутствия BOT_TOKEN — это нормально и пропускается)
//
// Запуск: node scripts/smoke-import-all.mjs
// Ожидание: «✅ N/N modules loaded» с нулевым exit code.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/+([A-Za-z]:)/, '$1'));

async function walk(dir, list = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, list);
    else if (e.name.endsWith('.js') && full.includes(`${path.sep}src${path.sep}`)) list.push(full);
  }
  return list;
}

// .env уже заполнены — config.loadConfig в seller/buyer/admin-api отработает.
process.env.DOTENV_CONFIG_PATH = '';

const files = await walk(path.join(ROOT, 'packages'));
files.sort();

// Entry points (index.js пакетов) не импортируем напрямую — у них
// env-валидация и top-level bot.start, что не подходит для smoke-теста.
// Их корректность подтверждена тем что в getMe боты отвечают.
const skip = (rel) =>
  rel.endsWith('/index.js') && rel.includes('-bot/');

let ok = 0;
const fails = [];
const skipped = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (skip(rel) || rel === 'packages/admin-api/src/index.js') {
    skipped.push(rel);
    continue;
  }
  try {
    // Дёргаем именно через file:// — иначе Windows-пути с пробелами сломают import.
    await import(pathToFileURL(f).href);
    ok++;
  } catch (err) {
    fails.push({ rel, err: err.message });
  }
}

console.log(`Loaded ${ok}/${files.length - skipped.length} modules (skipped ${skipped.length} entry points)`);
for (const f of fails) {
  console.log(`  ✖ ${f.rel}\n      ${f.err}`);
}

if (fails.length > 0) {
  console.log('\n❌ FAIL');
  process.exit(1);
} else {
  console.log('\n✅ OK — все non-entry модули импортируются без ошибок');
}
