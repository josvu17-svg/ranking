# Ranking (desktop app)

Tournament ranking for village volleyball tournaments. Teams, formats (Swiss stage,
Group stage + Playoffs, Single elimination), match results and standings.
Data is saved on the computer (no internet or server needed).

## Run

    npm install
    npm start          # builds the web part and opens the Electron window

## Build an installer

    npm run dist:win   # Windows folder with Ranking.exe  -> release/win-unpacked
    npm run dist       # installer for the OS you run it on (Windows .exe, macOS .dmg, Linux AppImage)

Build the macOS app on a Mac and the Windows installer on Windows.

## Code map

- `src/engine.js`   tournament rules (pure functions, tested in `tests/engine.test.js`)
- `src/adapters.js` turns engine data into bracket columns
- `src/App.jsx`     screens: landing, teams, formats, tournament
- `src/ui.jsx`      bracket, score window, standings window
- `electron/main.cjs` desktop window

Run tests: `npm test`

AI format generation ("Describe your own") is a preview only for now.
