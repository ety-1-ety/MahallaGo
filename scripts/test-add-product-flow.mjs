// Симулирует ровно тот же путь добавления товара, что делает бот:
//   shared.callFnRow('catalog.add_product', [shop_id, cat, 'Кот', null, photo, price, stock])
// Прогоняет несколько раз подряд + параллельно, чтобы воспроизвести
// возможные race-conditions без участия Telegram.
//
// Запуск:
//   cd packages/seller-bot
//   node ../../scripts/test-add-product-flow.mjs

import 'dotenv/config';
// Импортируем shared напрямую по пути; внутри shared библиотеки её
// собственные deps (pg, ioredis) подхватываются через node_modules
// относительно расположения файла shared/src/index.js.
const shared = await import('../packages/shared/src/index.js');
const { callFnRow, query, closePool } = shared;

const SHOP_ID = 'a83944e1-bd59-45bf-a016-58798a9846e5';

async function cleanup() {
  await query('DELETE FROM catalog.products WHERE shop_id = $1', [SHOP_ID]);
}

async function tryInsert(name, label) {
  try {
    const p = await callFnRow('catalog.add_product', [
      SHOP_ID, null, name, null, 'fake_photo_id', 1000, 5,
    ]);
    return { ok: true, label, id: p.id };
  } catch (err) {
    return {
      ok: false, label,
      code: err.code, constraint: err.constraint,
      detail: err.detail, msg: err.message,
    };
  }
}

console.log('═══ Тест 1: одиночный INSERT «Кот» на пустой БД ═══');
await cleanup();
console.log(' Результат:', await tryInsert('Кот', 'one'));
const after1 = await query('SELECT COUNT(*)::INT AS c FROM catalog.products WHERE shop_id = $1', [SHOP_ID]);
console.log(' В БД после:', after1.rows[0].c);

console.log('\n═══ Тест 2: повторный INSERT «Кот» (после первого) — ожидаем 23505 ═══');
console.log(' Результат:', await tryInsert('Кот', 'second'));

console.log('\n═══ Тест 3: cleanup и параллельные 5 одновременных INSERT «Кот» ═══');
await cleanup();
const results = await Promise.all([
  tryInsert('Кот', 'p1'),
  tryInsert('Кот', 'p2'),
  tryInsert('Кот', 'p3'),
  tryInsert('Кот', 'p4'),
  tryInsert('Кот', 'p5'),
]);
for (const r of results) console.log(' ', r);
const after3 = await query('SELECT COUNT(*)::INT AS c FROM catalog.products WHERE shop_id = $1', [SHOP_ID]);
console.log(' В БД после:', after3.rows[0].c, '(ожидаем 1)');

console.log('\n═══ Тест 4: последовательные INSERT с разными именами ═══');
await cleanup();
console.log(' insert «Кот»:',     await tryInsert('Кот',     'name1'));
console.log(' insert «Кошка»:',   await tryInsert('Кошка',   'name2'));
console.log(' insert «Кот»  ',    await tryInsert('Кот',     'name1-dup'));  // должен упасть
console.log(' insert «КОТ»  ',    await tryInsert('КОТ',     'name1-case')); // должен упасть (lower-insensitive)
console.log(' insert « Кот »',    await tryInsert(' Кот ',   'name1-trim')); // должен упасть (trim-insensitive)
const after4 = await query('SELECT name FROM catalog.products WHERE shop_id = $1 ORDER BY name', [SHOP_ID]);
console.log(' В БД после:', after4.rows.map(r => r.name));

console.log('\n═══ Cleanup ═══');
await cleanup();
const final = await query('SELECT COUNT(*)::INT AS c FROM catalog.products WHERE shop_id = $1', [SHOP_ID]);
console.log(' В БД финал:', final.rows[0].c);

await closePool();
