// End-to-end SQL-симуляция полного user-flow MahallaGo.
//
// Воспроизводит ровно то, что делают buyer-bot / seller-bot / admin-api
// при счастливом пути:
//
//   1. Seller: auth.upsert_user
//   2. Seller: shops.register (онбординг)
//   3. Admin:  shops.approve  (модерация)
//   4. Seller: catalog.add_product × 3 (товары)
//   5. Buyer:  auth.upsert_user
//   6. Buyer:  shops.find_nearby (поиск магазинов)
//   7. Buyer:  catalog.list_by_category / search_products (просмотр)
//   8. Buyer:  orders.create_order (checkout)
//   9. Seller: orders.update_status pending→accepted
//  10. Seller: orders.update_status accepted→ready
//  11. Seller: orders.update_status ready→delivering
//  12. Seller: orders.update_status delivering→completed
//  13. Verify: stock уменьшился, заказ виден в list_by_buyer / list_by_shop,
//      timeline содержит все 5 переходов с правильными акторами.
//
// Запуск: node scripts/test-e2e-flow.mjs

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:CHANGE_ME@localhost:5432/mahallago_dev' });

async function q(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✖ ${label} ${detail}`);
    failures++;
  }
}

async function main() {
  const stamp = Date.now();
  const SELLER_TG = 95000000 + (stamp % 10000);
  const BUYER_TG  = SELLER_TG + 1;
  const ADMIN_TG  = SELLER_TG + 2;

  console.log(`🧪 E2E flow simulation (stamp=${stamp})\n`);

  // ─── 1. Seller upsert ──────────────────────────────────────────
  console.log('— 1. Seller регистрируется в системе');
  await q('SELECT auth.upsert_user($1, $2, $3, $4, $5)',
    [SELLER_TG, `e2e_seller_${stamp}`, 'E2E', 'Seller', 'uz']);
  const sellerRow = await q('SELECT id FROM auth.users WHERE telegram_id = $1', [SELLER_TG]);
  const sellerId = sellerRow[0].id;
  check('seller создан', !!sellerId);

  // ─── 2. shops.register ─────────────────────────────────────────
  console.log('\n— 2. Seller онбординг → shops.register');
  // Точка магазина — Чорсу
  const shopRow = await q(
    `SELECT * FROM shops.register($1, 'E2E-Test-Shop', 'groceries', 'Тестовый магазин',
       'photo_id_stub', '+998901112233', 'Тестовая 1', 41.3266, 69.2387,
       '{}'::JSONB, 'Asia/Tashkent')`,
    [sellerId],
  );
  const shopId = shopRow[0].id;
  check('магазин зарегистрирован', !!shopId);
  check('магазин в статусе pending_approval', shopRow[0].status === 'pending_approval',
    `(было: ${shopRow[0].status})`);
  check('owner_id магазина = seller', shopRow[0].owner_id === sellerId);

  // ─── 3. shops.approve ──────────────────────────────────────────
  console.log('\n— 3. Admin одобряет магазин');
  await q('SELECT auth.upsert_user($1, $2, $3, $4, $5)',
    [ADMIN_TG, `e2e_admin_${stamp}`, 'E2E', 'Admin', 'ru']);
  await q('SELECT auth.mark_as_admin($1, TRUE)', [ADMIN_TG]);
  const adminRow = await q('SELECT id FROM auth.users WHERE telegram_id = $1', [ADMIN_TG]);
  const adminId = adminRow[0].id;

  await q('SELECT shops.approve($1, $2)', [shopId, adminId]);
  const approvedRow = await q('SELECT status, approved_at, approved_by FROM shops.shops WHERE id = $1', [shopId]);
  check('магазин одобрен', approvedRow[0].status === 'active', `(статус: ${approvedRow[0].status})`);
  check('approved_at заполнен', !!approvedRow[0].approved_at);
  check('approved_by = admin', approvedRow[0].approved_by === adminId);

  // ─── 4. catalog.add_product × 3 ────────────────────────────────
  console.log('\n— 4. Seller добавляет 3 товара');
  // Возьмём id категорий из seed'а
  const cats = await q("SELECT id, slug FROM catalog.categories WHERE is_active = TRUE ORDER BY sort_order LIMIT 3");
  const products = [];
  for (let i = 0; i < 3; i++) {
    const p = await q(
      'SELECT * FROM catalog.add_product($1, $2, $3, $4, $5, $6, $7)',
      [shopId, cats[i].id, `E2E-Product-${i}`, 'desc', 'photo_stub', 5000 + i * 1000, 100],
    );
    products.push(p[0]);
  }
  check('создано 3 товара', products.length === 3);
  check('у первого товара stock=100', products[0].stock === 100);
  check('у первого товара price=5000', Number(products[0].price) === 5000);

  // ─── 5. Buyer upsert ───────────────────────────────────────────
  console.log('\n— 5. Buyer регистрируется в системе');
  await q('SELECT auth.upsert_user($1, $2, $3, $4, $5)',
    [BUYER_TG, `e2e_buyer_${stamp}`, 'E2E', 'Buyer', 'ru']);
  const buyerRow = await q('SELECT id FROM auth.users WHERE telegram_id = $1', [BUYER_TG]);
  const buyerId = buyerRow[0].id;
  check('buyer создан', !!buyerId);

  // ─── 6. shops.find_nearby ──────────────────────────────────────
  console.log('\n— 6. Buyer ищет магазины поблизости (та же точка)');
  const nearby = await q(
    'SELECT id, name, distance_m FROM shops.find_nearby($1, $2, $3, 20, 0)',
    [41.3266, 69.2387, 2000],
  );
  const ourShop = nearby.find((s) => s.id === shopId);
  check('наш магазин найден в радиусе 2км', !!ourShop);
  check('distance_m ≈ 0 (та же точка)', ourShop && ourShop.distance_m < 50,
    `(distance=${ourShop?.distance_m}m)`);

  // ─── 7. catalog.list_by_category ───────────────────────────────
  console.log('\n— 7. Buyer открывает магазин и листает товары');
  const listed = await q(
    'SELECT id, name, price, stock FROM catalog.list_by_category($1, NULL, 1, 50)',
    [shopId],
  );
  check('возвращены все 3 товара', listed.length === 3,
    `(вернулось ${listed.length})`);

  // ─── 8. orders.create_order ────────────────────────────────────
  console.log('\n— 8. Buyer оформляет заказ (чек-аут)');
  const items = JSON.stringify([
    { product_id: products[0].id, qty: 2 }, // 5000 × 2 = 10000
    { product_id: products[1].id, qty: 1 }, // 6000 × 1 = 6000
    { product_id: products[2].id, qty: 3 }, // 7000 × 3 = 21000
  ]);
  const order = (await q(
    `SELECT * FROM orders.create_order($1::UUID, $2::UUID, $3::JSONB, $4, $5, $6, $7, 'cash')`,
    [buyerId, shopId, items, 41.3266, 69.2387, 'Тестовая 2', 'без звонка'],
  ))[0];

  check('заказ создан', !!order.id);
  check('заказ в статусе pending', order.status === 'pending', `(статус: ${order.status})`);
  check('subtotal = 37000', Number(order.subtotal) === 37000, `(${order.subtotal})`);
  check('total = 37000 (без доставки магазин default fee=0)', Number(order.total) === 37000);
  check('заказ привязан к buyer', order.buyer_id === buyerId);
  check('заказ привязан к shop',  order.shop_id === shopId);
  check('номер заказа > 0', order.number > 0);

  // Проверяем декремент stock
  const stocks = await q('SELECT id, stock FROM catalog.products WHERE shop_id = $1 ORDER BY name', [shopId]);
  const expectedStocks = [98, 99, 97];
  let stockOk = true;
  for (let i = 0; i < 3; i++) {
    if (stocks[i].stock !== expectedStocks[i]) stockOk = false;
  }
  check('stock декрементировался корректно у всех 3 товаров', stockOk,
    `(вышло: ${stocks.map((s) => s.stock).join(',')}, ожидалось: ${expectedStocks.join(',')})`);

  // ─── 9-12. update_status цепочка ───────────────────────────────
  console.log('\n— 9-12. Seller проводит заказ через все статусы');
  const transitions = [
    { from: 'pending',    to: 'accepted',   actor: sellerId },
    { from: 'accepted',   to: 'ready',      actor: sellerId },
    { from: 'ready',      to: 'delivering', actor: sellerId },
    { from: 'delivering', to: 'completed',  actor: sellerId },
  ];
  for (const tr of transitions) {
    const updated = await q(
      'SELECT * FROM orders.update_status($1, $2::orders.order_status, $3, NULL)',
      [order.id, tr.to, tr.actor],
    );
    check(`${tr.from} → ${tr.to}`, updated[0].status === tr.to,
      `(вышло: ${updated[0].status})`);
  }

  // ─── 13. Verify timeline ──────────────────────────────────────
  console.log('\n— 13. Проверка таймлайна и виду заказа');
  const tl = await q('SELECT prev_status, new_status, actor_id FROM orders.v_status_timeline WHERE order_id = $1 ORDER BY created_at',
    [order.id]);
  check('5 записей в timeline (pending + 4 перехода)', tl.length === 5,
    `(вышло ${tl.length})`);
  if (tl.length === 5) {
    const expected = [
      { prev: null,         new: 'pending',    actor: buyerId },
      { prev: 'pending',    new: 'accepted',   actor: sellerId },
      { prev: 'accepted',   new: 'ready',      actor: sellerId },
      { prev: 'ready',      new: 'delivering', actor: sellerId },
      { prev: 'delivering', new: 'completed',  actor: sellerId },
    ];
    for (let i = 0; i < 5; i++) {
      const got = tl[i];
      const exp = expected[i];
      const m = got.prev_status === exp.prev && got.new_status === exp.new && got.actor_id === exp.actor;
      check(`timeline[${i}]: ${exp.prev} → ${exp.new}`, m,
        `(${got.prev_status}→${got.new_status})`);
    }
  }

  // list_by_buyer / list_by_shop
  const buyerOrders = await q(
    `SELECT id, status FROM orders.list_by_buyer($1, NULL, 1, 50)`,
    [buyerId],
  );
  check('заказ виден у buyer (list_by_buyer)',
    buyerOrders.find((o) => o.id === order.id && o.status === 'completed'));

  const shopOrders = await q(
    `SELECT id, status FROM orders.list_by_shop($1, NULL, 1, 50)`,
    [shopId],
  );
  check('заказ виден у магазина (list_by_shop)',
    shopOrders.find((o) => o.id === order.id && o.status === 'completed'));

  // dashboard stats
  const stats = await q('SELECT * FROM orders.get_dashboard_stats($1, $2)', [shopId, 'today']);
  check('dashboard_stats(today): 1 завершённый заказ',
    Number(stats[0].orders_completed) === 1,
    `(${stats[0].orders_completed})`);
  check('dashboard_stats(today): revenue_completed = 37000',
    Number(stats[0].revenue_completed) === 37000,
    `(${stats[0].revenue_completed})`);

  // ─── Cleanup ───────────────────────────────────────────────────
  console.log('\n— teardown: удаляем тестовые данные');
  await q('DELETE FROM orders.orders WHERE shop_id = $1', [shopId]);
  await q('DELETE FROM catalog.products WHERE shop_id = $1', [shopId]);
  await q('DELETE FROM shops.moderation_log WHERE shop_id = $1', [shopId]);
  await q('DELETE FROM shops.shops WHERE id = $1', [shopId]);
  await q('DELETE FROM auth.users WHERE telegram_id IN ($1, $2, $3)', [SELLER_TG, BUYER_TG, ADMIN_TG]);

  await pool.end();

  console.log();
  if (failures === 0) {
    console.log('✅ E2E SIMULATION PASSED — полный flow работает корректно');
    process.exit(0);
  } else {
    console.log(`❌ ${failures} проверок не прошли`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✖ unexpected:', err);
  pool.end().catch(() => {});
  process.exit(2);
});
