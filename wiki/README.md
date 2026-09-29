# Little Star History Wiki

This repository is the content and knowledge-production workspace for the Little Star History project.

It is not the final website runtime. It is the source-of-truth repo for:

- raw historical source notes
- canonical history entities
- child-facing story summaries
- parent notes
- timeline and map plans
- structured export data for the frontend site

## Repository Role

Think of this repo as a knowledge compiler workspace.

- `raw/` stores raw source material and notes
- `wiki/sources/` stores normalized source pages
- `wiki/entities/` stores canonical entities such as events, people, places, factions, and map layers
- `wiki/synthesis/` stores child stories, parent notes, curriculum views, and templates
- `scripts/export-history-data.ts` compiles selected story modules into product JSON
- `06_Exports/json/` stores generated frontend-ready JSON

## Current Scope

The current MVP focuses on:

- `184 黄巾起义`
- `190 董卓进京`

The next major content expansion will cover:

- 三皇五帝
- 春秋战国
- 秦
- 楚汉相争
- 东汉末年到三国形成

## Workflow

1. Add or revise raw sources in `raw/sources/`
2. Normalize them into `wiki/sources/`
3. Build canonical pages in `wiki/entities/`
4. Write child and parent synthesis in `wiki/synthesis/`
5. Export runtime JSON for the site

## Commands

```bash
npm run export:history
```

## Related Repository

The frontend runtime lives in the sibling repository:

- `little-star-history-site`
