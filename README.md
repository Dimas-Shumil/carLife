# CarLife

Сайт автосервиса CarLife с сохранением заявок, защищённой административной панелью и разделом работ.

## Возможности

- заявки сохраняются в SQLite независимо от доступности SMTP;
- статусы, поиск, внутренние комментарии и пагинация заявок;
- защищённый вход администратора, серверные сессии и CSRF;
- создание, публикация и сортировка работ;
- обязательная обложка и единая галерея дополнительных фотографий;
- автоматическая обработка изображений через Sharp и сохранение в WebP;
- блок работ на главной, список `/works` и серверные страницы `/works/:slug`;
- динамические sitemap.xml и SEO-метаданные работ.

## Локальный запуск

Требуется Node.js 22 или новее.

```cmd
copy .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run css
npm run admin:create
npm run check
npm start
```

Открыть:

- сайт: `http://127.0.0.1:3000`;
- работы: `http://127.0.0.1:3000/works`;
- админка: `http://127.0.0.1:3000/admin`;
- проверка: `http://127.0.0.1:3000/api/health`.

SMTP-поля в `.env` можно оставить пустыми для локальной разработки. В этом случае заявки сохраняются в базе, но письма не отправляются.

## Production

Перед запуском установить:

```env
NODE_ENV=production
SITE_ORIGIN=https://carlife-abakan.ru
DATABASE_URL="file:./dev.db"
```

После обновления проекта:

```bash
npm ci
npx prisma migrate deploy
npm run css
npm run check
pm2 restart carlife
pm2 save
```

Каталог `site/uploads/works` и файл `prisma/dev.db` должны сохраняться между деплоями и входить в резервное копирование.
