<p align="center">
  <img src="icon-192.png" alt="Randomizer icon" width="120">
</p>

<h1 align="center">ITG Randomizer</h1>

A song picker for In The Groove. Set a min/max block rating, hit the button, and the wheel spins to a random chart from the pool.

Installs as a PWA - save it to your phone home screen and it works offline.

## Energizer mode

Tap the small "Energizer?" text at the top and the theme flips red. If the current rating range covers any of Energizer's charts (1, 5, 9, 10, 12), every other slot in the wheel becomes Energizer, so the spin has about a 50/50 chance of landing on it. Tap "Pls no Energizer!" to flip back.

## Updating the song list

Two Node scripts:

- `generate-songs.js` walks the In The Groove pack folders, pulls every `dance-single` chart's difficulty name and block rating out of each `.sm` file, and writes `songs.json`. Run it from a directory that contains `In The Groove/` and `In The Groove 2/`, or pass other pack dirs as args.
- `compact-songs.js` rewrites `songs.json` in place: drops the unused `pack` field, converts each song's difficulties from `[{name, rating}, …]` to a `{name: rating}` map, and strips whitespace. Roughly ¼ the original size. Idempotent.

Typical flow:

```sh
node generate-songs.js
node compact-songs.js
```
