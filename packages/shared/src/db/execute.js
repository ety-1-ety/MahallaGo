// Обёртки для вызова SQL-функций модулей БД.
//
// callFn('shops.find_nearby', [lat, lng, radius]) → массив строк
// callFnRow('orders.create_order', [...]) → одна строка (composite)
//
// Маппинг ошибок: pg-исключения с известными доменными кодами
// превращаются в DomainError (см. errors.js).

import { getPool } from './pool.js';
import { fromPgError } from '../errors.js';

/**
 * Вызвать SQL-функцию, возвращающую SETOF (несколько строк).
 * Использует SELECT * FROM <fn>($1, $2, ...).
 */
export async function callFn(fnName, params = [], { client } = {}) {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM ${fnName}(${placeholders})`;
  const exec = client || getPool();
  try {
    const { rows } = await exec.query(sql, params);
    return rows;
  } catch (err) {
    throw fromPgError(err);
  }
}

/**
 * Вызвать SQL-функцию, возвращающую одну composite-строку.
 *
 * ВАЖНО: используем `SELECT * FROM <fn>(...)`, а НЕ `SELECT (<fn>(...)).*`.
 * Второй синтаксис - известная ловушка PostgreSQL: композитное проектирование
 * `(...).*` заставляет PG вызвать функцию по разу на каждую колонку
 * композитного типа. Для функций с side-effects (INSERT в add_product,
 * UPDATE в update_status и т.п.) это означает 10+ выполнений вместо одного,
 * что либо создаёт лавину дубликатов (без UNIQUE), либо валится с
 * unique_violation (при наличии индекса).
 *
 * `SELECT * FROM fn(...)` распаковывает composite-результат в колонки,
 * вызывая функцию ровно один раз.
 */
export async function callFnRow(fnName, params = [], { client } = {}) {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM ${fnName}(${placeholders})`;
  const exec = client || getPool();
  try {
    const { rows } = await exec.query(sql, params);
    return rows[0] || null;
  } catch (err) {
    throw fromPgError(err);
  }
}

/**
 * Сырой запрос (для VIEW и кастомных SELECT).
 * Используйте только когда callFn недостаточно.
 */
export async function query(sql, params = [], { client } = {}) {
  const exec = client || getPool();
  try {
    const result = await exec.query(sql, params);
    return result;
  } catch (err) {
    throw fromPgError(err);
  }
}
