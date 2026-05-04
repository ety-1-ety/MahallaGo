export const environment = {
  production: true,
  // На проде admin-web и admin-api живут на одном домене,
  // разделяются по префиксу /api/ через локальный Nginx (см. 03-publish-admin.sh).
  apiUrl: '/api',
};
