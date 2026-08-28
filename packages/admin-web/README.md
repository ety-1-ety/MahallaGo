# @mahallago/admin-web

Angular 21 SPA для админ-панели MahallaGo. Собирается в статику и
отдаётся через Nginx (`shop.mahgo.uz`), общается с admin-api
через `https://api.mahgo.uz`.

## Стек

- **Angular 21** standalone components, signals, `@if/@for/@switch`, OnPush.
- **Angular Material 20** с **кастомной темой**: primary `#1eb53a` (зелёный флага УЗ), tertiary `#0099b5` (синий флага УЗ).
- **Light/Dark mode toggle** - сохраняется в localStorage, по умолчанию следует system preference.
- **i18n uz/ru** через простой signal-based сервис (без `@angular/localize`), default - русский.
- **ng2-charts + Chart.js** - KPI-графики на дашборде.
- Auth - Telegram Login Widget → JWT в httpOnly cookie (через admin-api).

## Маршруты

| Path | Компонент | Статус |
|---|---|---|
| `/login` | `Login` | ✅ полная реализация с Telegram Login Widget |
| `/dashboard` | `Dashboard` | ✅ KPI карточки + 2 графика (GMV, заказы по часам) |
| `/moderation` | `Moderation` | ✅ очередь pending shops с approve/reject |
| `/shops` | `ShopsList` | ✅ таблица с фильтрами и поиском |
| `/shops/:id` | `ShopDetail` | ✅ карточка магазина + товары + suspend |
| `/orders` | stub | ⏳ MVP+1 |
| `/users` | stub | ⏳ MVP+1 |
| `/map` | stub | ⏳ MVP+1 (планировался ngx-leaflet, отложен) |
| `/analytics` | stub | ⏳ MVP+1 |
| `/settings` | stub | ⏳ MVP+1 |

## Структура

```
src/
├── main.ts                       - bootstrap
├── index.html
├── styles.scss                   - кастомная UZ-flag тема, light/dark
├── environments/                 - apiUrl, botUsername (dev/prod)
└── app/
    ├── app.ts, app.config.ts, app.routes.ts
    ├── core/
    │   ├── theme/theme.service.ts        - light/dark + localStorage
    │   ├── i18n/{i18n.service,t.pipe,uz,ru}.ts
    │   ├── auth/{auth.service,auth.guard,auth.interceptor}.ts
    │   └── api/api.service.ts            - типизированный клиент admin-api
    ├── shared/
    │   └── kpi-card/kpi-card.ts
    ├── layout/
    │   └── shell/shell.ts                - sidenav (260px) + toolbar
    └── features/
        ├── login/login.ts                - Telegram Login Widget intеграция
        ├── dashboard/dashboard.ts        - KPI + 2 chart canvas
        ├── moderation/{moderation,reject-dialog}.ts
        ├── shops/{shops-list,shop-detail}.ts
        └── stub/stub.ts                  - заглушка для незавершённых страниц
```

## Запуск

```bash
pnpm install            # из корня монорепо
pnpm --filter @mahallago/admin-web start   # → http://localhost:4200
```

Dev-сервер ожидает admin-api на `http://localhost:3000` (см. environment.development.ts).

## Сборка

```bash
pnpm --filter @mahallago/admin-web build
# Output: packages/admin-web/dist/admin-web/browser/
```

Отдаётся Nginx-ом как статика. Bundle ~2 MB initial (под бюджет 1.5 MB не пролезаем - это нормально для production-build с lazy chunks).

## Известные ограничения MVP

- Карта (`/map`) пока stub - `@asymmetrik/ngx-leaflet` ещё не поддерживает Angular 21. Когда выйдет совместимая версия - добавить.
- Страницы `/orders`, `/users`, `/analytics`, `/settings` - stub'ы. Бэкенд для них уже есть в admin-api.
- Telegram Login Widget требует HTTPS-домен с настроенным `setDomain` в @BotFather.
