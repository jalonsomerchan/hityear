#!/usr/bin/env node

/**
 * Corrige años de canciones usando la API pública de Deezer.
 *
 * Uso:
 *   node tools/fixSongYearsFromDeezer.js          # modo dry-run, no modifica archivos
 *   node tools/fixSongYearsFromDeezer.js --write  # actualiza los JS de data/
 *
 * Nota:
 * Deezer devuelve fechas asociadas al track/album disponible en su catálogo.
 * En reediciones o remasters puede devolver el año de la edición y no el año original.
 * Por eso el script imprime todos los cambios para revisión.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WRITE = process.argv.includes('--write');
const ONLY_FILE = process.argv.find(arg => arg.startsWith('--file='))?.split('=')[1];
const CURRENT_YEAR = new Date().getFullYear();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getDataFiles() {
  return fs
    .readdirSync(DATA_DIR)
    .filter(file => file.endsWith('.js'))
    .filter(file => file !== 'themes.js')
    .filter(file => !ONLY_FILE || file === ONLY_FILE);
}

function parseDataset(content, file) {
  const match = content.match(/^(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(\[.*\])\s*;?\s*$/s);

  if (!match) {
    throw new Error(`No se pudo parsear ${file}. Se esperaba: var nombre = [...]`);
  }

  const [, variableName, arraySource] = match;
  const songs = Function(`"use strict"; return (${arraySource});`)();

  if (!Array.isArray(songs)) {
    throw new Error(`${file} no contiene un array de canciones`);
  }

  return { variableName, songs };
}

async function fetchDeezerTrack(deezerId) {
  const url = `https://api.deezer.com/track/${encodeURIComponent(deezerId)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || 'Deezer error');
  }

  return data;
}

function extractYear(track) {
  const releaseDate = track?.release_date || track?.album?.release_date;
  if (!releaseDate) return null;

  const year = Number(String(releaseDate).slice(0, 4));
  if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR) return null;

  return year;
}

function serializeDataset(variableName, songs) {
  return `var ${variableName} = ${JSON.stringify(songs, null, 4)};\n`;
}

async function processFile(file) {
  const fullPath = path.join(DATA_DIR, file);
  const content = fs.readFileSync(fullPath, 'utf8');
  const { variableName, songs } = parseDataset(content, file);

  let changes = 0;
  let checked = 0;
  let skipped = 0;
  let errors = 0;

  console.log(`\n📂 ${file}`);

  for (const song of songs) {
    if (!song.deezerId) {
      skipped += 1;
      continue;
    }

    checked += 1;

    try {
      const track = await fetchDeezerTrack(song.deezerId);
      const deezerYear = extractYear(track);

      if (!deezerYear) {
        skipped += 1;
        console.log(`  ⚪ Sin año en Deezer: ${song.title} - ${song.artist}`);
        continue;
      }

      if (Number(song.year) !== deezerYear) {
        console.log(`  🛠️ ${song.title} - ${song.artist}: ${song.year} → ${deezerYear}`);
        song.year = deezerYear;
        changes += 1;
      }
    } catch (err) {
      errors += 1;
      console.log(`  ❌ Error con ${song.title} (${song.deezerId}): ${err.message}`);
    }

    // Pequeña pausa para evitar ráfagas agresivas contra la API pública.
    await sleep(120);
  }

  if (WRITE && changes > 0) {
    fs.writeFileSync(fullPath, serializeDataset(variableName, songs), 'utf8');
  }

  console.log(`  ✅ Revisadas: ${checked} · Cambios: ${changes} · Saltadas: ${skipped} · Errores: ${errors}`);

  return { file, checked, changes, skipped, errors };
}

async function main() {
  const files = getDataFiles();

  if (files.length === 0) {
    console.log('No hay archivos de canciones para revisar.');
    return;
  }

  console.log(WRITE ? '✍️ Modo escritura activado' : '👀 Modo dry-run: no se modificarán archivos');

  const totals = {
    checked: 0,
    changes: 0,
    skipped: 0,
    errors: 0,
  };

  for (const file of files) {
    const result = await processFile(file);
    totals.checked += result.checked;
    totals.changes += result.changes;
    totals.skipped += result.skipped;
    totals.errors += result.errors;
  }

  console.log('\n📊 Resumen');
  console.log(`Revisadas: ${totals.checked}`);
  console.log(`Cambios ${WRITE ? 'aplicados' : 'propuestos'}: ${totals.changes}`);
  console.log(`Saltadas: ${totals.skipped}`);
  console.log(`Errores: ${totals.errors}`);

  if (!WRITE && totals.changes > 0) {
    console.log('\nPara aplicar los cambios ejecuta:');
    console.log('node tools/fixSongYearsFromDeezer.js --write');
  }
}

main().catch(err => {
  console.error(`\n💥 ${err.message}`);
  process.exit(1);
});
