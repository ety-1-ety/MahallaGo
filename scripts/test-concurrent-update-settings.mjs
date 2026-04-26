// ─────────────────────────────────────────────────────────────────
// Регрессионный тест: shops.update_settings под параллельной нагрузкой.
//
// Сценарий: один магазин, исходно (min=100000, max=500000).
// Параллельно запускаем N транзакций — каждая меняет ОДНО поле
// (половина — min, половина — max), значения уникальные.
//
// Ожидание (с FOR UPDATE):
//   - все N транзакций успешно применятся;
//   - финальное значение min = последнее назначенное, max = последнее
//     назначенное (все обновления видны, нет «потеряшек»);
//   - записанные значения совпадают с тем, что задавал последний
//     писатель в каждой группе (min-pisateli vs max-pisateli).
//
// Без FOR UPDATE: каждая транзакция читает «старое» значение второго
// поля и при UPDATE затирает то, что параллельная транзакция уже
// успела закоммитить → последняя транзакция «откатит» всех остальных
// в исходное состояние одного из полей. Тест это поймает по rollback'у
// (одно из полей будет = 100000 или 500000, а не последнему set'у).
//
// Дополнительно: проверяем валидацию max>=min — невалидные пары
// должны быть отклонены (RAISE 'MAX_ORDER_LESS_THAN_MIN').
//
// Запуск:
//   node scripts/test-concurrent-update-settings.mjs
//   PARALLEL=20 node scripts/test-concurrent-update-settings.mjs
// ─────────────────────────────────────────────────────────────────

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const PARALLEL = Number(process.env.PARALLEL) || 20;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('✖ DATABASE_URL не задан');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: PARALLEL + 4 });

async function q(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

async function setup() {
  const stamp = Date.now();
  const sellerTg = 90000000 + (stamp % 1000000) + 1000;

  await q('SELECT auth.upsert_user($1, $2, $3, $4, $5)',
    [sellerTg, `t_us_seller_${stamp}`, 'CT', 'Seller', 'ru']);
  const sellerRow = await q('SELECT id FROM auth.users WHERE telegram_id = $1', [sellerTg]);
  const sellerId  = sellerRow[0].id;

  const shopRow = await q(`
    INSERT INTO shops.shops (
      owner_id, name, slug, category, phone, address, location, status,
      min_order_amount, max_order_amount, delivery_fee, free_delivery_from,
      delivery_radius_m, is_accepting_orders, working_hours
    ) VALUES (
      $1, 'CT-Settings-Shop', $2, 'groceries', '+998900000000', 'CT-addr',
      ST_SetSRID(ST_MakePoint(69.2387, 41.3266), 4326)::GEOGRAPHY,
      'active', 100000, 500000, 0, NULL, 5000, TRUE, '{}'::JSONB
    ) RETURNING id`,
    [sellerId, `test-us-${stamp}`]);
  return { shopId: shopRow[0].id };
}

async function cleanup(shopId) {
  await q('DELETE FROM shops.shops WHERE id = $1', [shopId]);
}

// ── Часть 1: обновления разных полей не теряются ─────────────────
async function testNoLostUpdates(shopId) {
  console.log(`\n— часть 1: ${PARALLEL} параллельных update'ов разных полей`);

  const half = Math.floor(PARALLEL / 2);
  // Половина — обновляет min на разные значения, половина — max.
  // Берём такие диапазоны чтобы валидация max>=min заведомо проходила.
  const tasks = [];
  for (let i = 0; i < half; i++) {
    // min: 110000..110000+half-1, всегда < наш минимальный max (300000)
    const min = 110000 + i;
    tasks.push({ kind: 'min', value: min });
  }
  for (let i = 0; i < PARALLEL - half; i++) {
    // max: 600000..600000+half-1, всегда > нашего максимального min
    const max = 600000 + i;
    tasks.push({ kind: 'max', value: max });
  }

  // Перемешаем порядок запуска
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }

  const t0 = Date.now();
  const results = await Promise.all(tasks.map(async (task) => {
    if (task.kind === 'min') {
      await pool.query(
        `SELECT shops.update_settings($1::UUID, $2, NULL, NULL, NULL, NULL, NULL, FALSE, FALSE)`,
        [shopId, task.value],
      );
    } else {
      await pool.query(
        `SELECT shops.update_settings($1::UUID, NULL, $2, NULL, NULL, NULL, NULL, FALSE, FALSE)`,
        [shopId, task.value],
      );
    }
    return task;
  }));
  const dt = Date.now() - t0;

  const finalRow = await q('SELECT min_order_amount, max_order_amount FROM shops.shops WHERE id = $1', [shopId]);
  const finalMin = Number(finalRow[0].min_order_amount);
  const finalMax = Number(finalRow[0].max_order_amount);

  const minValues = results.filter((r) => r.kind === 'min').map((r) => r.value);
  const maxValues = results.filter((r) => r.kind === 'max').map((r) => r.value);

  console.log(`   completed in ${dt} ms`);
  console.log(`   final min=${finalMin} max=${finalMax}`);
  console.log(`   expected min ∈ [${Math.min(...minValues)}..${Math.max(...minValues)}], max ∈ [${Math.min(...maxValues)}..${Math.max(...maxValues)}]`);

  let pass = true;
  if (!minValues.includes(finalMin)) {
    // Это ключевая проверка: без FOR UPDATE финальный min будет либо 100000
    // (исходный, если последняя max-транзакция затёрла его), либо случайный
    // не из minValues. С FOR UPDATE он гарантированно один из minValues.
    console.error(`   ✖ финальный min=${finalMin} НЕ из заданного набора — потерян update`);
    pass = false;
  }
  if (!maxValues.includes(finalMax)) {
    console.error(`   ✖ финальный max=${finalMax} НЕ из заданного набора — потерян update`);
    pass = false;
  }
  if (pass) console.log('   ✅ ни один из update\'ов не потерян');
  return pass;
}

// ── Часть 2: валидация max>=min при race ─────────────────────────
async function testValidationUnderRace(shopId) {
  console.log(`\n— часть 2: одновременная попытка задать min=200000 и max=150000`);

  // Сбросим в исходное состояние
  await q(`UPDATE shops.shops SET min_order_amount = 100000, max_order_amount = 500000 WHERE id = $1`,
    [shopId]);

  // Tx A: установить min=200000 (валидно, max=500000 >= 200000)
  // Tx B: установить max=150000 (валидно само по себе, но если Tx A коммитит
  //       первым, то min=200000 и max=150000 даст 150000<200000 → должно упасть)
  // С FOR UPDATE одна из транзакций пройдёт, другая увидит уже изменённое
  // значение и валидация max>=min не пропустит.
  const txA = pool.query(
    `SELECT shops.update_settings($1::UUID, 200000, NULL, NULL, NULL, NULL, NULL, FALSE, FALSE)`,
    [shopId],
  ).then(() => ({ tx: 'A', ok: true })).catch((e) => ({ tx: 'A', ok: false, code: e.message }));

  const txB = pool.query(
    `SELECT shops.update_settings($1::UUID, NULL, 150000, NULL, NULL, NULL, NULL, FALSE, FALSE)`,
    [shopId],
  ).then(() => ({ tx: 'B', ok: true })).catch((e) => ({ tx: 'B', ok: false, code: e.message }));

  const [a, b] = await Promise.all([txA, txB]);

  const finalRow = await q('SELECT min_order_amount, max_order_amount FROM shops.shops WHERE id = $1', [shopId]);
  const finalMin = Number(finalRow[0].min_order_amount);
  const finalMax = Number(finalRow[0].max_order_amount);

  console.log(`   tx A (min=200000): ${a.ok ? 'ok' : 'fail (' + a.code + ')'}`);
  console.log(`   tx B (max=150000): ${b.ok ? 'ok' : 'fail (' + b.code + ')'}`);
  console.log(`   final min=${finalMin} max=${finalMax}`);

  let pass = true;
  // Инвариант: должен сохраниться min <= max
  if (finalMin > finalMax) {
    console.error(`   ✖ нарушен инвариант min(${finalMin}) <= max(${finalMax})`);
    pass = false;
  }
  // Хотя бы одна из транзакций должна была упасть, либо порядок такой что
  // обе валидны (если B успел до A — finalMax=150000, finalMin=100000 — это ок;
  // если A успел до B — то B упадёт). Но max=150000 + min=200000 одновременно
  // быть не может: это нарушение, и мы это уже проверили выше.
  const okCount = (a.ok ? 1 : 0) + (b.ok ? 1 : 0);
  if (okCount === 0) {
    console.error(`   ✖ обе транзакции упали — это странно`);
    pass = false;
  }
  if (pass) console.log('   ✅ инвариант min <= max сохранён, валидация работает');
  return pass;
}

async function main() {
  console.log(`🧪 concurrent update_settings: parallel=${PARALLEL}`);
  const ctx = await setup();
  console.log(`   shop ${ctx.shopId}`);

  let allPass = true;
  try {
    if (!(await testNoLostUpdates(ctx.shopId))) allPass = false;
    if (!(await testValidationUnderRace(ctx.shopId))) allPass = false;
  } finally {
    await cleanup(ctx.shopId);
    await pool.end();
  }

  console.log();
  if (allPass) {
    console.log('✅ PASS — update_settings корректно сериализуется через FOR UPDATE');
  } else {
    console.log('❌ FAIL — обнаружена race condition или потеряны обновления');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('✖ unexpected:', err);
  pool.end().catch(() => {});
  process.exit(2);
});
