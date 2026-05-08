#!/usr/bin/env node
// Walks ITG pack folders, parses each .sm file's #NOTES blocks, and writes
// every dance-single chart's difficulty + rating into songs.json.
//
// Usage: node generate-songs.js [packDir...]
//   defaults: 'In The Groove' 'In The Groove 2'
// Run from a directory containing the pack folders. Output goes to ./songs.json.

const fs = require('fs');
const path = require('path');

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('In The Groove', 'In The Groove 2');

const RENAME = { Beginner: 'Novice', Challenge: 'Expert' };
const ORDER = ['Novice', 'Easy', 'Medium', 'Hard', 'Expert'];
const orderIdx = name => {
  const i = ORDER.indexOf(name);
  return i === -1 ? ORDER.length : i;
};

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && p.toLowerCase().endsWith('.sm')) yield p;
  }
}

const songs = new Map();

for (const root of roots) {
  if (!fs.existsSync(root)) {
    console.warn(`skipping missing dir: ${root}`);
    continue;
  }
  for (const file of walk(root)) {
    const pack = path.basename(path.dirname(path.dirname(file)));
    const title = path.basename(path.dirname(file));
    const text = fs.readFileSync(file, 'utf8');

    let inNotes = false, field = 0, type = '', diff = '';
    for (const line of text.split('\n')) {
      if (/^#NOTES:/.test(line)) {
        inNotes = true; field = 0; type = ''; diff = '';
        continue;
      }
      if (inNotes && /:\s*$/.test(line)) {
        const val = line.trim().replace(/:\s*$/, '');
        field++;
        if (field === 1) type = val;
        else if (field === 3) diff = val;
        else if (field === 4) {
          if (type === 'dance-single') {
            const key = `${pack}\t${title}`;
            if (!songs.has(key)) songs.set(key, { pack, title, difficulties: [] });
            const rating = /^\d+$/.test(val) ? parseInt(val, 10) : val;
            const name = RENAME[diff] ?? diff;
            songs.get(key).difficulties.push({ name, rating });
          }
          inNotes = false;
        }
      }
    }
  }
}

for (const song of songs.values()) {
  song.difficulties.sort((a, b) => orderIdx(a.name) - orderIdx(b.name));
}

fs.writeFileSync('songs.json', JSON.stringify(Array.from(songs.values()), null, 2));
console.log(`Wrote songs.json — ${songs.size} songs`);
