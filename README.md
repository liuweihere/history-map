# Little Star History Site

This repository is the frontend runtime for the Little Star History project.

It consumes exported knowledge data from the sibling content repository:

- `little-star-history-wiki`

## Repository Role

This repo is responsible for:

- the child-facing map-first history experience
- the timeline UI
- MapLibre rendering
- runtime reading of generated JSON data
- static map assets such as the China base layer

It does not store raw historical research as the source of truth. That work belongs in `little-star-history-wiki`.

## Data Flow

```text
little-star-history-wiki
  raw sources
    -> canonical wiki pages
    -> exported JSON
      -> little-star-history-site
        -> runtime map + timeline UI
```

## Key Directories

- `app/` Next.js app routes and page shell
- `components/` atlas UI and map stage
- `lib/` runtime data shaping and story scene config
- `public/data/generated/` generated story data synced from the wiki repo
- `public/data/static/` static map assets such as `china-base.geojson`
- `scripts/sync-history-data.mjs` syncs generated exports from the wiki repo
- `scripts/run-next.mjs` wraps dev/build/start with a stable startup flow

## Commands

```bash
npm run dev
npm run build
```

## Current Runtime Scope

The current site includes:

- `184 黄巾起义`
- `190 董卓进京`

with a dual-story atlas runtime and a China base map layer.
