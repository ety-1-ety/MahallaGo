// ─────────────────────────────────────────────────────────────────
// Регрессионный тест: orders.create_order под параллельной нагрузкой.
//
// Сценарий: один магазин, один товар со stock=N. Запускаем M
// параллельных create_order, каждый просит qty=1.
//
// Ожидание:
//   - ровно N вызовов вернут заказ (успех);
//   - M-N вызовов получат ITEM_OUT_OF_STOCK;
//   - финальный stock у товара = 0;
//   - в orders.orders ровно N записей по этому магазину после теста.
//
// Без `FOR UPDATE` в orders.create_order возможны oversell'ы:
// несколько транзакций видят stock=N, все проходят проверку,
// все декрементят, итог stock < 0.
//
// Запуск:
//   node scripts/test-concurrent-create-order.mjs
//   STOCK=10 PARALLEL=20 node scripts/test-concurrent-create-order.mjs
// ─────────────────────────────────────────────────────────────────

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const STOCK    = Number(process.env.STOCK)    || 10;
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
  // Изолированный seller/shop для теста — slug уникален по времени.
  const stamp = Date.now();
  const sellerTg = 90000000 + (stamp % 1000000);
  const buyerTg  = sellerTg + 1;

  await q('SELECT auth.upsert_user($1, $2, $3, $4, $5)',
    [sellerTg, `t_seller_${stamp}`, 'CT', 'Seller', 'ru']);
  await q('SELECT auth.upsert_user($1, $2, $3, $4, $5)',
    [buyerTg, `t_buyer_${stamp}`, 'CT', 'Buyer', 'ru']);

  const sellerRow = await q('SELECT id FROM auth.users WHERE telegram_id = $1', [sellerTg]);
  const buyerRow  = await q('SELECT id FROM auth.users WHERE telegram_id = $1', [buyerTg]);
  const sellerId  = sellerRow[0].id;
  const buyerId   = buyerRow[0].id;

  // Магазин в Ташкенте (Чорсу), 24/7 открыт, без min/max лимитов.
  const slug = `test-concurrent-${stamp}`;
  const shopRow = await q(`
    INSERT INTO shops.shops (
      owner_id, name, slug, category, phone, address, location, status,
      min_order_amount, max_order_amount, delivery_fee, free_delivery_from,
      delivery_radius_m, is_accepting_orders, working_hours
    ) VALUES (
      $1, 'CT-Shop', $2, 'groceries', '+998900000000', 'CT-addr',
      ST_SetSRID(ST_MakePoint(69.2387, 41.3266), 4326)::GEOGRAPHY,
      'active', 0, NULL, 0, NULL, 5000, TRUE, '{}'::JSONB
    ) RETURNING id`,
    [sellerId, slug]);
  const shopId = shopRow[0].id;

  const productRow = await q(`
    INSERT INTO catalog.products (shop_id, name, price, stock, is_active)
    VALUES ($1, 'CT-Product', 5000, $2, TRUE)
    RETURNING id`,
    [shopId, STOCK]);
  const productId = productRow[0].id;

  return { shopId, buyerId, productId, slug };
}

async function cleanup(shopId) {
  // CASCADE снесёт products, order_items, status_history.
  await q('DELETE FROM orders.orders WHERE shop_id = $1', [shopId]);
  await q('DELETE FROM catalog.products WHERE shop_id = $1', [shopId]);
  await q('DELETE FROM shops.shops WHERE id = $1', [shopId]);
}

async function placeOrder({ buyerId, shopId, productId }) {
  const items = JSON.stringify([{ product_id: productId, qty: 1 }]);
  try {
    const { rows } = await pool.query(
      `SELECT (orders.create_order($1::UUID, $2::UUID, $3::JSONB, $4, $5, $6, NULL, 'cash')).id AS id`,
      [buyerId, shopId, items, 41.3266, 69.2387, 'CT-addr'],
    );
    return { ok: true, id: rows[0].id };
  } catch (err) {
    return { ok: false, code: err.message };
  }
}

async function main() {
  console.log(`🧪 concurrent create_order: stock=${STOCK}, parallel=${PARALLEL}`);

  const ctx = await setup();
  console.log(`   set up shop ${ctx.shopId}, product ${ctx.productId} (stock=${STOCK})`);

  try {
    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () => placeOrder(ctx)),
    );
    const dt = Date.now() - t0;

    const ok   = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok);
    const oos  = fail.filter((r) => r.code.includes('ITEM_OUT_OF_STOCK')).length;
    const other = fail.filter((r) => !r.code.includes('ITEM_OUT_OF_STOCK'));

    const expectedOk   = Math.min(STOCK, PARALLEL);
    const expectedFail = Math.max(0, PARALLEL - STOCK);

    const stockRow = await q('SELECT stock FROM catalog.products WHERE id = $1', [ctx.productId]);
    const ordersRow = await q('SELECT COUNT(*)::INT AS c FROM orders.orders WHERE shop_id = $1', [ctx.shopId]);
    const finalStock = stockRow[0].stock;
    const orderCount = ordersRow[0].c;

    console.log(`   completed in ${dt} ms`);
    console.log(`   ok=${ok}  ITEM_OUT_OF_STOCK=${oos}  other_errors=${other.length}`);
    console.log(`   final stock=${finalStock}  orders.orders rows=${orderCount}`);

    let pass = true;
    if (ok !== expectedOk)              { console.error(`   ✖ expected ok=${expectedOk}, got ${ok}`);       pass = false; }
    if (oos !== expectedFail)           { console.error(`   ✖ expected fail=${expectedFail}, got ${oos}`); pass = false; }
    if (other.length !== 0)             { console.error(`   ✖ unexpected errors:`, other.slice(0, 5));      pass = false; }
    if (finalStock !== Math.max(0, STOCK - PARALLEL)) {
      console.error(`   ✖ expected stock=${Math.max(0, STOCK - PARALLEL)}, got ${finalStock}`); pass = false;
    }
    if (orderCount !== expectedOk)      { console.error(`   ✖ expected ${expectedOk} order rows, got ${orderCount}`); pass = false; }

    if (pass) {
      console.log('✅ PASS — race-protection через FOR UPDATE работает корректно');
    } else {
      console.log('❌ FAIL — обнаружена потенциальная race condition');
      process.exitCode = 1;
    }
  } finally {
    await cleanup(ctx.shopId);
    await pool.end();
  }
}

main().catch((err) => {
  console.error('✖ unexpected:', err);
  pool.end().catch(() => {});
  process.exit(2);
});
