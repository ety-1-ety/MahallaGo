// ─────────────────────────────────────────────────────────────────
// Обёртки для вызова SQL-функций модулей БД.
//
// callFn('shops.find_nearby', [lat, lng, radius]) → массив строк
// callFnRow('orders.create_order', [...]) → одна строка (composite)
//
// Маппинг ошибок: pg-исключения с известными доменными кодами
// превращаются в DomainError (см. errors.js).
// ─────────────────────────────────────────────────────────────────

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
 * Использует SELECT (<fn>($1,$2,...)).* для распаковки composite-типа
 * в колонки. Возвращает первую строку или null.
 */
export async function callFnRow(fnName, params = [], { client } = {}) {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT (${fnName}(${placeholders})).*`;
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
