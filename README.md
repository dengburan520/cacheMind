# Personal Notes

Simple personal notes website with:

- note title and description
- optional tags
- image upload
- customizable background color
- customizable background image
- saved code snippets with title and description
- instant local search
- direct note editing
- optional Supabase login for per-user cloud notes

## Run

Open `index.html` in a browser.

## Publish as Website

This project can be hosted on GitHub Pages so people can open it with a normal website link.

### Steps

1. Create a new GitHub repository.
2. Upload these files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
   - `supabase-config.example.js`
   - `supabase-schema.sql`
3. In the GitHub repository, open `Settings` -> `Pages`.
4. Under `Build and deployment`, choose:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
5. Save and wait a minute or two.

Your site link will usually be:

`https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/`

If the repository is named `YOUR_GITHUB_USERNAME.github.io`, the site link becomes:

`https://YOUR_GITHUB_USERNAME.github.io/`

## Local Mode

Without Supabase setup, the app uses `localStorage`.

- Notes stay only in that browser on that device.
- Refreshing the page keeps your notes.
- Clearing browser storage removes them.
- Images and background images are stored there too, so very large images can hit browser limits.

## Supabase Mode

This project now includes a starter path for multi-user notes:

- users sign in with email magic links
- each user sees only their own notes
- notes are loaded from Supabase instead of browser-only storage

### Setup

1. Create a Supabase project.
2. In the Supabase SQL editor, run [supabase-schema.sql](</c:/Users/User/deng project/supabase-schema.sql>).
3. Turn on Email auth in Supabase.
4. Copy [supabase-config.example.js](</c:/Users/User/deng project/supabase-config.example.js>) and use its values inside the `window.NOTES_APP_CONFIG` block in [index.html](</c:/Users/User/deng project/index.html>), or replace that block with your own config source.
5. Open the app from a real hosted URL such as GitHub Pages for magic-link login to work smoothly.

## Current Scope

- notes are cloud-ready
- theme settings and heading still stay in browser storage
- note images are currently stored directly in the notes record as text data, which is okay for a starter but not ideal for larger production use


