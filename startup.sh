#!/bin/bash
cd /home/site/wwwroot
npm install --production
npx prisma generate
node dist/index.js
