'use strict';

const SERVICES = require('./services');

const DEFAULT_ORIGIN = 'https://carlife-abakan.ru';

function getSiteOrigin() {
  try {
    return new URL(process.env.SITE_ORIGIN || DEFAULT_ORIGIN).origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

module.exports = Object.freeze({
  brand: 'CarLife',
  legalName: 'Индивидуальный предприниматель Лайков Николай Николаевич',
  leadPrefix: 'CL',
  origin: getSiteOrigin(),
  phone: '+79233900000',
  phoneDisplay: '+7 (923) 390-00-00',
  email: 'info@carlife-abakan.ru',
  city: 'Абакан',
  address: 'г. Абакан, ул. Игарская, 7, стр. 1',
  timezone: 'Asia/Krasnoyarsk',
  services: SERVICES,
});
