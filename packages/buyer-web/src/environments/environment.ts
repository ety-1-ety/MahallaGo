export const environment = {
  production: true,
  apiBase: '/api/miniapp/buyer',
  useTelegramSdkMock: false,
  mockTelegramUser: null as null | {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  },
};
