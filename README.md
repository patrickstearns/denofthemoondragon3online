# Dragon's Den III

Online HTML5 table for up to four players (humans and AI). Authoritative Node server, Socket.io, vanilla client.

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) (or whichever `PORT` you set). Share that URL on your LAN, or tunnel it (`ngrok http 3000`, Cloudflare Tunnel, etc.).

## Deploy on Render

This is one Node web service (`npm start`). It reads `PORT` from the environment and listens on `0.0.0.0`. WebSockets stay on (Socket.io). There is no database; the lobby lives in memory, so keep **one instance** and expect a restart to wipe in-progress games.

`render.yaml` is a Render Blueprint. After the repo is on GitHub:

1. Push `main` to [github.com/patrickstearns/denofthemoondragon3online](https://github.com/patrickstearns/denofthemoondragon3online).
2. In [Render](https://dashboard.render.com/), **New +** → **Blueprint**.
3. Connect that GitHub repo. Render reads `render.yaml` and creates a free web service named `denofthemoondragon3`.
4. When the deploy is live, open `https://denofthemoondragon3.onrender.com`.

Or skip the Blueprint: **New +** → **Web Service**, connect the repo, set **Build** to `npm install`, **Start** to `npm start`, **Health Check Path** to `/health`, and Node 20.

Free instances sleep after idle time; the first visit can take a minute to wake. For a game night, a paid instance stays up.

Locally, set `PORT` if 3000 is taken (`PORT=3010 npm start`).

## How to play

1. Enter a name on the title screen. If anyone is named **Dragon**, they go first (random among ties). Otherwise the table asks who most recently pet a cat.
2. Create or join a game. The creator sets each seat to Human, AI, or Closed.
3. Raid the den: follow the arrows, stop in rooms, fight denizens, grab loot, dodge cats, beat the Dragon (Might 8 / Guile 8, use the lower of your stats). First escapee draws 2 loot, second draws 1. Highest treasure among escaped players wins. 0 HP is elimination — no revives.

Board art is `DD3 Board.png`. Cards are generated from the rules sheet (no separate card illustrations).
"# denofthemoondragon3online" 
