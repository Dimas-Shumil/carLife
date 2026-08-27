'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const folders = ['config', 'lib', 'middleware', 'routes', 'scripts', 'services', 'site/js', 'site/script'];
const files = ['server.js'];

function collectJavaScript(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScript(absolutePath);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path.relative(root, absolutePath));
  }
}

for (const folder of folders) collectJavaScript(path.join(root, folder));

for (const file of [...new Set(files)].sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

const required = [
  'public/index.html', 'public/works.html', 'public/404.html', 'prisma/schema.prisma',
  'admin-pages/login.html', 'admin-pages/dashboard.html', 'admin-pages/leads.html',
  'admin-pages/works.html', 'admin-pages/work-edit.html', '.env.example',
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Отсутствует обязательный файл: ${file}`);
}

console.log(`Проверено JavaScript-файлов: ${new Set(files).size}. Структура проекта готова.`);
