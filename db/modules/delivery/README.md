# Модуль `delivery` (Phase 2 — placeholder)

В MVP (Phase 1) этот модуль **пуст**. Доставку выполняют сами магазины
своими силами — `orders.create_order` создаёт заказ сразу со статусом
`pending`, далее продавец принимает и доставляет вручную (через колонку
`delivery_address` и `delivery_location` в `orders.orders`).

## Будущий scope (Phase 2)

Когда будет внедрена централизованная курьерская сеть, в этом модуле
появятся:

### Таблицы
- `delivery.couriers` — курьеры (Telegram-аккаунт, документы, статус,
  средство передвижения, текущее местоположение).
- `delivery.assignments` — назначения «заказ ↔ курьер» с историей.
- `delivery.zones` — зоны доставки (полигоны PostGIS) для эффективного
  матчинга.
- `delivery.fees` — динамическое ценообразование по дистанции/времени.

### Функции
- `delivery.find_courier(order_id)` — подобрать ближайшего свободного
  курьера для заказа.
- `delivery.accept_assignment(assignment_id, courier_id)`.
- `delivery.update_courier_location(courier_id, lat, lng)` — частые
  обновления через WebSocket / Telegram Live Location.
- `delivery.complete(assignment_id)` — завершение, списание, отзыв.

### Интеграции
- Telegram Live Location для трекинга курьеров.
- Push-уведомления покупателю с координатами курьера.
- Pricing engine с учётом расстояния, погоды и пиковых часов.

### Изменения в `orders.orders`
- Новый статус `searching_courier` между `accepted` и `ready`.
- FK `courier_assignment_id` → `delivery.assignments.id`.
- Триггер на смену статуса `ready`, запускающий `delivery.find_courier`.

---

Пока этот файл-заглушка нужен только чтобы migration runner знал о
существовании модуля и мог корректно его пропускать (в нём нет `.sql`
файлов).
