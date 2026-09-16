# Kreworx

Field operations for home-services contractors — dispatch, crews, customers and
the money, in one place.

A plumbing, HVAC or electrical business with four to twenty vans runs its day on
a whiteboard, a group text and a stack of carbon-copy invoice pads. Kreworx is
the software that replaces all three: a dispatch board the office lives in, a
map that shows where every van actually is, a phone app for the crew, and a link
the customer opens to see when their technician will arrive and to approve the
work with one tap.

> **Status: in build.** Stage 1 — the foundation — is done: both deploys are
> live, the design system is in place, and the app shell is real. The screens
> behind it arrive stage by stage; each one says on the page what it will hold,
> so nothing on screen is pretending to be finished.
>
> The API runs on a free instance while this is being built, so it sleeps after
> a quarter hour idle and the first request afterwards takes about a minute.

| | |
|---|---|
| **Demo** | **https://kreworx.vercel.app** |
| **API** | https://kreworx-api.onrender.com/api/health |
| **Stack** | React 19 · Vite · Tailwind v4 · React Router · Express 5 · Mongoose · Socket.io · MongoDB |

## One system, two themes

The theme is not a user preference — it is a property of the surface.

**Ops** is dark, because dispatch is on a screen somebody stares at for nine
hours. **Customer** is light, because the portal is opened on a phone in a
driveway and the quote gets printed. They share a typeface, a spacing scale and
one accent hue at two lightnesses, so they read as one product rather than two.

Both palettes live in [`client/src/index.css`](client/src/index.css) as scoped
custom properties, mapped onto Tailwind colour names once. A component writes
`bg-surface` and inherits whichever theme it lands in, which is what lets the
ops app embed a preview of the customer's view without a fight over a global
class.

## Running it locally

You need Node 22+ and either Docker or a MongoDB you can point at.

```bash
git clone https://github.com/RafBro8/kreworx.git
cd kreworx

docker compose up -d                     # MongoDB on port 27030

cd server && npm install
cp .env.example .env
npm run dev                              # http://localhost:4200

cd ../client && npm install
npm run dev                              # http://localhost:5200
```

The client proxies `/api` and the socket connection to the server, so there is
nothing to configure for local development. Ports 4200/5200/27030 are
deliberately off the usual defaults so Kreworx can run alongside other projects.

Check the stack is wired end to end:

```bash
curl http://localhost:4200/api/health
```

The ops header reports the same thing — a green dot and "API connected" means
the database answered too.

## Checks

Both packages run the same three commands, and CI runs all of them on every push.

```bash
cd client && npm run lint && npm test && npm run build
cd server && npm run typecheck && npm test && npm run build
```

The server tests boot a real MongoDB in memory, so they need no running
database and no service container in CI.

## Deployment

**Client → Vercel.** Root Directory is `client`;
[`client/vercel.json`](client/vercel.json) supplies the framework preset, the
output directory and the SPA rewrite. Set `VITE_API_URL` to the Render URL plus
`/api`.

**API → Render.** [`render.yaml`](render.yaml) describes the service: root
directory `server`, health check on `/api/health`, and the free plan while
this is in build — free services sleep when idle, so move to starter before
showing the URL to anyone. `MONGODB_URI` and `CLIENT_ORIGIN` are set in the
dashboard.

**Database → MongoDB Atlas.**

Every deploy reports which commit is live:

```bash
curl https://<api-host>/api/health
```

## Repository

```
client/   React app — ops and customer surfaces, design tokens, app shell
server/   Express API — config, routes, middleware, realtime
.github/  CI
```

## What is coming

| Stage | |
|---|---|
| 1 | **Foundation** — repo, design tokens, app shell, both deploys live |
| 2 | Data model, roles, a seeded demo business and a role switcher |
| 3 | The dispatch board and the live map |
| 4 | The customer portal — live arrival, photos, one-tap approval |
| 5 | Quotes and invoices, Stripe in test mode, PDF |
| 6 | The crew's phone app — the day's stops, photos, notes |
| 7 | The owner's dashboard |
| 8 | Polish, end-to-end tests in CI |
