#!/usr/bin/env node
/**
 * Build do front-end (HTML/JS puro, sem empacotador):
 *   public/  → dist/
 *   src/     → dist/src/
 *   dist/config.js ← API_BASE_URL (variável de ambiente ou arquivo .env)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

function readDotEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return {};
  const vars = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return vars;
}

const apiBase = (process.env.API_BASE_URL || readDotEnv().API_BASE_URL || '').trim().replace(/\/$/, '');

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
fs.cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });

if (apiBase) {
  if (!/^https?:\/\/[^\s"'<>]+$/.test(apiBase)) {
    console.error(`API_BASE_URL inválida: ${apiBase}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(dist, 'config.js'),
    `// Gerado pelo build. Endereço da API (backend).\nwindow.TIBIA_API_BASE = ${JSON.stringify(apiBase)};\n`);
  console.log(`Build concluído em dist/ — API: ${apiBase}`);
} else {
  console.warn('Aviso: API_BASE_URL não definida; usando o config.js de desenvolvimento (http://localhost:3000).');
  console.log('Build concluído em dist/');
}
