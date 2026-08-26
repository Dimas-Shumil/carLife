'use strict';

const path = require('node:path');

function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Маршрут не найден.' });
  }
  return res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);
  const status = Number(error?.status || error?.statusCode) || 500;
  const safeMessage = status >= 400 && status < 500;
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      message: safeMessage ? String(error.message || 'Некорректный запрос.') : 'Внутренняя ошибка сервера.',
    });
  }
  return res.status(status).send(safeMessage ? 'Некорректный запрос' : 'Внутренняя ошибка сервера');
}

module.exports = { notFoundHandler, errorHandler };
