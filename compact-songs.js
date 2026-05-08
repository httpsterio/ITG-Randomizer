#!/usr/bin/env node
// Compacts songs.json: drops `pack`, converts `difficulties` from
// array of {name, rating} to object {name: rating}, minifies output.
// Idempotent — running on an already-compacted file is a no-op.
//
// Usage: node compact-songs.js [input] [output]
//   defaults: input = songs.json, output = songs.json (overwrites)

const fs = require('fs');

const inputPath = process.argv[2] || 'songs.json';
const outputPath = process.argv[3] || inputPath;

const before = fs.statSync(inputPath).size;
const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const compact = raw.map(song => {
  const difficulties = Array.isArray(song.difficulties)
    ? Object.fromEntries(song.difficulties.map(d => [d.name, d.rating]))
    : song.difficulties;
  return { title: song.title, difficulties };
});

fs.writeFileSync(outputPath, JSON.stringify(compact));
const after = fs.statSync(outputPath).size;

console.log(`${inputPath} → ${outputPath}`);
console.log(`${compact.length} songs · ${before} → ${after} bytes (${(100 * (1 - after / before)).toFixed(1)}% smaller)`);
