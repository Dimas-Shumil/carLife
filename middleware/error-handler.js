'use strict';

const path = require('node:path');

function notFoundHandler(req, res) {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Маршрут не найден.' });
  }
  return res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (process.env.NODE_ENV === 'production') {
    console.error({
      message: String(error?.message || 'Unknown error'),
      code: error?.code,
      status: error?.status || error?.statusCode,
    });
  } else {
    console.error(error);
  }
  const requestedStatus = Number(error?.status || error?.statusCode) || 500;
  const status = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
  const safeMessage = status >= 400 && status < 500;
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(status).json({
      message: safeMessage ? String(error.message || 'Некорректный запрос.') : 'Внутренняя ошибка сервера.',
    });
  }
  return res.status(status).send(safeMessage ? 'Некорректный запрос' : 'Внутренняя ошибка сервера');
}

module.exports = { notFoundHandler, errorHandler };
