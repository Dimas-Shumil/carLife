'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function versionParts(version) {
  return String(version || '').replace(/^[^0-9]*/, '').split('.').map((part) => Number(part) || 0);
}

function versionAtLeast(current, minimum) {
  const left = versionParts(current);
  const right = versionParts(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return true;
}

const packageJson = JSON.parse(read('package.json'));
const multerVersion = packageJson.dependencies?.multer;
if (!versionAtLeast(multerVersion, '2.2.0')) {
  fail('Multer должен быть версии 2.2.0 или новее.');
}
const rateLimitVersion = packageJson.dependencies?.['express-rate-limit'];
if (!versionAtLeast(rateLimitVersion, '8.6.2')) {
  fail('express-rate-limit должен быть версии 8.6.2 или новее.');
}

const server = read('server.js');
if (!server.includes("scriptSrcAttr: [\"'none'\"]")) fail('Не запрещены встроенные обработчики JavaScript в CSP.');
if (/scriptSrc\s*:[^\n]*unsafe-inline/.test(server)) fail('В script-src нельзя использовать unsafe-inline.');
if (!server.includes("app.set('trust proxy', isProduction ? 'loopback' : false)")) fail('Проверьте безопасную настройку trust proxy.');
if (/app\.use\(\s*['"]\/site['"]/.test(server)) fail('Нельзя публиковать весь каталог site целиком.');
if (server.includes('express.urlencoded(')) fail('URL-encoded body parser не используется проектом и должен быть отключен.');

for (const duplicate of ['index.html', 'privacy-policy.html']) {
  if (fs.existsSync(path.join(root, duplicate))) {
    fail(`Удалите дублирующий файл ${duplicate}; рабочая HTML-разметка находится в public/.`);
  }
}

const htmlFolders = ['public', 'admin-pages'];
for (const folder of htmlFolders) {
  for (const name of fs.readdirSync(path.join(root, folder))) {
    if (!name.endsWith('.html')) continue;
    const relativePath = `${folder}/${name}`;
    if (/\son[a-z]+\s*=/i.test(read(relativePath))) {
      fail(`В ${relativePath} найден встроенный обработчик события.`);
    }
  }
}

const upload = read('lib/upload.js');
for (const requiredLimit of ['fieldNestingDepth', 'parts:', 'fields:']) {
  if (!upload.includes(requiredLimit)) fail(`Для загрузки изображений отсутствует лимит ${requiredLimit}`);
}

if (failures.length) {
  console.error('Проверка безопасности не пройдена:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Статическая проверка безопасности пройдена.');
