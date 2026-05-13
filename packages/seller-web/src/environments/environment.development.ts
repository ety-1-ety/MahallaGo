export const environment = {
  production: false,
  apiBase: '/api/miniapp/seller',
  useTelegramSdkMock: true,
  // Для локальной разработки: mock telegram_id владельца действующего магазина.
  // На проде поле игнорируется (используется реальный Telegram.WebApp.initData).
  mockTelegramUser: {
    id: 35767754,
    first_name: 'Тимур',
    username: 'ety_1_ety',
    language_code: 'ru',
  },
};
