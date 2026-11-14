# MTG Draft (Scryfall + Supabase + GitHub Pages)

1. Create a Supabase project, run `schema.sql` in the SQL editor.
2. Put your Project URL and anon key at the top of `app.js`.
3. Push these files to a GitHub repo, then Settings > Pages > deploy from `main` / root.
4. One player creates a room (enter a set code like `dsk`), friends join with the 4-letter code, host starts the draft.

Flow: lobby -> 3 rounds of 15-card packs (passing left/right/left) -> deck builder -> shared playtable.
Playtable: click hand card = play, click battlefield card = tap, right-click = to graveyard/discard.
