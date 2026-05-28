# Design Bundle

The wireframe + design-token source of truth for the whole project. Now
co-located inside OpenSpec at [`openspec/wireframes/`](../../openspec/wireframes/).

## Location

```
openspec/wireframes/
├── Onboarding Spec _standalone_.html   ← open in a browser for the visual
└── source/                              ← JSX files for grep / diff
    ├── spec-flow.jsx
    ├── spec-chapters.jsx
    ├── spec-primitives.jsx
    ├── design-system/colors_and_type.css
    └── ... (~50 files)
```

No fetch, no `/tmp/` path, no curl URL. It ships with the scaffold.

Full inventory + how-to-use in [`openspec/wireframes/README.md`](../../openspec/wireframes/README.md).

## How to apply it

When asked about a frame's intended shape:

1. Read the relevant JSX (`openspec/wireframes/source/spec-flow.jsx` for
   F1–F6, `openspec/wireframes/source/spec-chapters.jsx` for F2 detail,
   `openspec/wireframes/source/spec-nav-v2.jsx` for F1 + F7).
2. Compare line-by-line against the current code.
3. Use the chats (not in repo — ask the user for the chat log if needed)
   for "why" questions (intent, tradeoffs).

The wireframes use Kalam (cursive) font as a medium signifier — that's a
wireframe convention. **Production uses Inter.** Don't copy Kalam into
committed code.

## What's shipped vs what's not

See [`openspec/wireframes/README.md`](../../openspec/wireframes/README.md)
sections "What's shipped from the spec" + "What's not yet shipped" — those
two tables are the canonical answer.

## When the spec disagrees with the user

The user wins. Update `openspec/wireframes/` (or note the deviation in
`gotchas.md`) and proceed.
