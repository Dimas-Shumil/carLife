'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = global.__carLifePrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__carLifePrisma = prisma;
}

module.exports = prisma;
