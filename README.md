# Dragon's Den III

Online HTML5 table for up to four players (humans and AI). Authoritative Node server, Socket.io, vanilla client.

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) (or whichever `PORT` you set). Share that URL on your LAN, or tunnel it (`ngrok http 3000`, Cloudflare Tunnel, etc.).

## Deploy (Render / Railway / Fly)

This is a single web service. Set `PORT` if 3000 is already taken (`set PORT=3010` on Windows PowerShell, `PORT=3010 npm start` on Unix). Example start command: `npm start`.

- Enable WebSockets on the host.
- Root directory is this project.
- Node 18+.

No database. Games live in memory; a restart wipes the lobby.

## How to play

1. Enter a name on the title screen. If anyone is named **Dragon**, they go first (random among ties). Otherwise the table asks who most recently pet a cat.
2. Create or join a game. The creator sets each seat to Human, AI, or Closed.
3. Raid the den: follow the arrows, stop in rooms, fight denizens, grab loot, dodge cats, beat the Dragon (Might 8 / Guile 8, use the lower of your stats). First escapee draws 2 loot, second draws 1. Highest treasure among escaped players wins. 0 HP is elimination — no revives.

Board art is `DD3 Board.png`. Cards are generated from the rules sheet (no separate card illustrations).
"# denofthemoondragon3online" 
