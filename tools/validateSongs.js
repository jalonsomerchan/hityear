#!/usr/bin/env node

/**
 * Validador de datasets de canciones para HitYear
 * Detecta:
 * - años sospechosos
 * - duplicados
 * - previews vacíos
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function loadFiles() {
  return fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.js'));
}

function extractArray(content) {
  const match = content.match(/=\s*(\[.*\]);?/s);
  if (!match) return [];
  return eval(match[1]);
}

function validate() {
  const files = loadFiles();
  const seen = new Map();

  files.forEach(file => {
    const full = path.join(DATA_DIR, file);
    const content = fs.readFileSync(full, 'utf-8');
    const songs = extractArray(content);

    console.log(`\n📂 ${file} (${songs.length} canciones)`);

    songs.forEach(s => {
      const key = `${s.title}__${s.artist}`;

      // duplicados
      if (seen.has(key)) {
        console.log(`🔁 DUPLICADO: ${s.title} - ${s.artist}`);
      } else {
        seen.set(key, true);
      }

      // años sospechosos
      if (s.year < 1950 || s.year > new Date().getFullYear()) {
        console.log(`⚠️ AÑO SOSPECHOSO: ${s.title} (${s.year})`);
      }

      // preview vacío
      if (!s.preview) {
        console.log(`🔇 SIN PREVIEW: ${s.title}`);
      }
    });
  });
}

validate();
