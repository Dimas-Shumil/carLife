'use strict';

const nodemailer = require('nodemailer');
const site = require('../config/site');

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isMailConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || '').trim() &&
    String(process.env.SMTP_USER || '').trim() &&
    String(process.env.SMTP_PASS || '') &&
    String(process.env.TO_EMAIL || '').trim(),
  );
}

function createTransporter() {
  if (!isMailConfigured()) return null;
  return nodemailer.createTransport({
    host: String(process.env.SMTP_HOST).trim(),
    port: Number(process.env.SMTP_PORT) || 465,
    secure: parseBoolean(process.env.SMTP_SECURE),
    auth: {
      user: String(process.env.SMTP_USER).trim(),
      pass: String(process.env.SMTP_PASS),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (symbol) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[symbol]);
}

async function sendLeadNotification(lead) {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, reason: 'not_configured' };

  const createdAt = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: site.timezone,
  }).format(lead.createdAt);
  const subject = `Новая заявка CarLife: ${lead.service}`.replace(/[\r\n]/g, ' ');
  const text = [
    'Новая заявка с сайта CarLife',
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    `Услуга: ${lead.service}`,
    `Автомобиль: ${lead.car || '—'}`,
    `Комментарий: ${lead.comment || '—'}`,
    `Дата: ${createdAt}`,
  ].join('\n');
  const html = `
    <div style="max-width:640px;background:#080808;color:#f5f5f5;padding:32px;font-family:Arial,sans-serif;border:1px solid #d71920;border-radius:18px">
      <div style="color:#ff3944;font-weight:800;letter-spacing:.12em">CARLIFE</div>
      <h1 style="margin:14px 0 24px;font-size:28px">Новая заявка</h1>
      <p><b>Имя:</b> ${escapeHtml(lead.name)}</p>
      <p><b>Телефон:</b> <a style="color:#ff5a62" href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a></p>
      <p><b>Услуга:</b> ${escapeHtml(lead.service)}</p>
      <p><b>Автомобиль:</b> ${escapeHtml(lead.car || '—')}</p>
      <p><b>Комментарий:</b> ${escapeHtml(lead.comment || '—')}</p>
      <p style="color:#969696">${escapeHtml(createdAt)}</p>
    </div>`;

  await transporter.sendMail({
    from: `"CarLife сайт" <${process.env.SMTP_USER}>`,
    to: String(process.env.TO_EMAIL).trim(),
    subject,
    text,
    html,
  });
  transporter.close();
  return { sent: true };
}

async function verifyMailConnection() {
  const transporter = createTransporter();
  if (!transporter) return { configured: false };
  try {
    await transporter.verify();
    return { configured: true, ready: true };
  } catch (error) {
    return { configured: true, ready: false, error };
  } finally {
    transporter.close();
  }
}

module.exports = { isMailConfigured, sendLeadNotification, verifyMailConnection };
