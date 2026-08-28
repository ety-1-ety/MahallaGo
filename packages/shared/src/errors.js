// Коды ошибок и классы исключений.
//
// SQL-функции бросают исключения через RAISE EXCEPTION '<CODE>',
// node-postgres подаёт их в err.message. Используем эти коды для
// маппинга в локализованные сообщения для пользователя.

// Коды ошибок orders.create_order (6 валидаций из SPEC.md +
// дополнительные проверки)
export const ORDER_ERRORS = Object.freeze({
  SHOP_NOT_AVAILABLE:    'SHOP_NOT_AVAILABLE',
  OUT_OF_DELIVERY_RANGE: 'OUT_OF_DELIVERY_RANGE',
  BELOW_MIN_ORDER:       'BELOW_MIN_ORDER',
  ABOVE_MAX_ORDER:       'ABOVE_MAX_ORDER',
  SHOP_CLOSED_NOW:       'SHOP_CLOSED_NOW',
  ITEM_OUT_OF_STOCK:     'ITEM_OUT_OF_STOCK',
  // Товар отсутствует (удалён) или скрыт продавцом - НЕ то же самое
  // что ITEM_OUT_OF_STOCK (товар есть, но мало).
  ITEM_NOT_AVAILABLE:    'ITEM_NOT_AVAILABLE',
  EMPTY_CART:            'EMPTY_CART',
  INVALID_DELIVERY_ADDRESS: 'INVALID_DELIVERY_ADDRESS',
  INVALID_ITEM_QTY:      'INVALID_ITEM_QTY',
});

// Коды ошибок других модулей
export const COMMON_ERRORS = Object.freeze({
  USER_NOT_FOUND:                'USER_NOT_FOUND',
  SHOP_NOT_FOUND:                'SHOP_NOT_FOUND',
  PRODUCT_NOT_FOUND:             'PRODUCT_NOT_FOUND',
  ORDER_NOT_FOUND:               'ORDER_NOT_FOUND',
  SHOP_ALREADY_ACTIVE:           'SHOP_ALREADY_ACTIVE',
  REJECTION_REASON_REQUIRED:     'REJECTION_REASON_REQUIRED',
  SUSPEND_REASON_REQUIRED:       'SUSPEND_REASON_REQUIRED',
  REASON_REQUIRED:               'REASON_REQUIRED',
  INVALID_STATUS_TRANSITION:     'INVALID_STATUS_TRANSITION',
  INVALID_LANGUAGE_CODE:         'INVALID_LANGUAGE_CODE',
  INVALID_SHOP_NAME:             'INVALID_SHOP_NAME',
  INVALID_SHOP_PHONE:            'INVALID_SHOP_PHONE',
  INVALID_PRODUCT_NAME:          'INVALID_PRODUCT_NAME',
  INVALID_PRODUCT_PRICE:         'INVALID_PRODUCT_PRICE',
  INVALID_PRODUCT_STOCK:         'INVALID_PRODUCT_STOCK',
  MAX_ORDER_LESS_THAN_MIN:       'MAX_ORDER_LESS_THAN_MIN',
});

export class DomainError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.name = 'DomainError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Превращает ошибку pg в DomainError, если это известный SQL-код.
 * Поведение: SQL RAISE EXCEPTION '<CODE>' попадает в err.message;
 * мы матчим по списку известных кодов.
 */
export function fromPgError(err) {
  if (err instanceof DomainError) return err;

  const known = new Set([
    ...Object.values(ORDER_ERRORS),
    ...Object.values(COMMON_ERRORS),
  ]);

  const msg = err && err.message ? String(err.message).trim() : '';
  if (known.has(msg)) {
    return new DomainError(msg, msg, err && err.detail);
  }
  return err;
}

/**
 * Определяет, можно ли показать ошибку пользователю как локализованное
 * сообщение (т.е. это известный domain code), либо это системная ошибка.
 */
export function isDomainErrorCode(code) {
  if (!code) return false;
  const known = new Set([
    ...Object.values(ORDER_ERRORS),
    ...Object.values(COMMON_ERRORS),
  ]);
  return known.has(code);
}
