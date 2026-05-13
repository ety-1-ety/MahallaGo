export const environment = {
  production: false,
  apiBase: '/api/miniapp/buyer',
  useTelegramSdkMock: true,
  // Mock покупателя для локальной разработки (HMAC fail на бэке OK).
  mockTelegramUser: {
    id: 35767754,
    first_name: 'Тимур',
    username: 'ety_1_ety',
    language_code: 'ru',
  },
};
