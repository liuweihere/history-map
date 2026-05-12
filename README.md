# Little Star History Site

This repo is the runtime-facing frontend for the sibling knowledge repo:

- `../little-star-history-wiki` — source-of-truth content and exporter
- `./public/data/generated` — synced product JSON snapshots for the site

## Data flow

1. Run the wiki exporter in `little-star-history-wiki`
2. Run `npm run sync:data` in this repo
3. Start the site with `npm run dev`

## Design direction

- Map-first layout
- Historical atlas / editorial paper aesthetic
- Strong year rail
- Child-friendly explanation panel
- Clear separation between source wiki and runtime site

