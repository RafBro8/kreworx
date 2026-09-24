# Kreworx

Field operations for home-services contractors - dispatch, crews, customers and
the money, in one place.

A plumbing, HVAC or electrical business with four to twenty vans runs its day on
a whiteboard, a group text and a stack of carbon-copy invoice pads. Kreworx is
the software that replaces all three: a dispatch board the office lives in, a
map that shows where every van actually is, a phone app for the crew, and a link
the customer opens to see when their technician will arrive and to approve the
work with one tap.

> **Status: in build.** Stages 1-5 are done: both deploys are live, the app
> runs on a seeded demo business with real sign-in and roles, the board and the
> live map are working, the office has the customer book and writes its own
> quotes and invoices, and a customer can approve their quote, pay their
> invoice by card, download either as a PDF, see the photos of the work and
> read the record of the visit - all from one link. Screens still to come say
> on the page what they will hold.
>
> The API runs on a free instance while this is being built, so it sleeps after
> a quarter hour idle and the first request afterwards takes about a minute.

| | |
|---|---|
| **Demo** | **https://kreworx.vercel.app** |
| **API** | https://kreworx-api.onrender.com/api/health |
| **Stack** | React 19 · Vite · Tailwind v4 · React Router · Express 5 · Mongoose · Socket.io · MongoDB |

## One system, two themes

The theme is not a user preference - it is a property of the surface.

**Ops** is dark, because dispatch is on a screen somebody stares at for nine
hours. **Customer** is light, because the portal is opened on a phone in a
driveway and the quote gets printed. They share a typeface, a spacing scale and
one accent hue at two lightnesses, so they read as one product rather than two.

Both palettes live in [`client/src/index.css`](client/src/index.css) as scoped
custom properties, mapped onto Tailwind colour names once. A component writes
`bg-surface` and inherits whichever theme it lands in, which is what lets the
ops app embed a preview of the customer's view without a fight over a global
class.

## The demo

Open the site and pick a seat at **Northline Mechanical**, a fictional heating
and cooling contractor in Mokena, Illinois: the owner, the dispatcher, a
technician, or a customer holding the link to her job. There is no sign-up, and
the account menu switches seats at any time.

The photographs are real equipment, from Wikimedia Commons under licences that
permit commercial use, and each sits on a job it genuinely fits: the rooftop
unit belongs to Brightway Dental, who have two of them.
[`server/src/demo/photos/CREDITS.md`](server/src/demo/photos/CREDITS.md) says
where each came from.

The business is generated from a script in [`server/src/demo`](server/src/demo)
that matches the design artboards: four crews, eleven jobs today with four done
by mid-morning, $4,180 invoiced, and Amara Osei waiting on a $379 quote. The
days around it are filled from templates.

The day also moves. It runs on a fast clock: the working day replays over each
real hour, so crews set off, arrive and finish while you watch, and the
customer page counts down the arrival. The board shows where the day has got
to, the clock is labelled so nobody mistakes it for real time, and anything a
person changes is left alone by the simulation. The hour is counted from when the demo was last built, not from the clock on
the wall, so the owner pressing Reset really does hand back a fresh morning.
The demo also rebuilds itself when the day finishes and when the date changes
in Chicago.

## How it is put together

- **Tenancy.** Every document belongs to a company and every query filters by
  the signed-in company. Tests check that one business cannot see another's jobs.
- **Roles.** Owner, dispatcher and technician. A technician sees their own crew
  and nothing else. The server enforces it; the navigation only reflects it.
- **Sessions.** A signed token in an httpOnly cookie. The client calls `/api` on
  its own domain and Vercel forwards it to Render, so the cookie is first-party
  and survives Safari blocking third-party cookies.
- **The customer book belongs to the office.** A technician sees the jobs on
  their own crew and the notes attached to them, which is what they need at the
  door. Browsing every customer a business has ever had - phone numbers, gate
  codes, what they have spent - is a different thing, and the server refuses it
  to anyone but an owner or a dispatcher.
- **Customers have no accounts.** Each job has a long random link, and the portal
  response is built from an allow-list so nothing internal can leak through it.
  The one thing they can change is their own quote: the link identifies which
  quote that is, so no request body can reach anybody else's money, and the
  write is guarded on the quote still being unanswered, which is what makes a
  double tap land as one answer.
- **Photos live in MongoDB.** A visit's photos are small, few, and always read
  alongside the job they belong to, so they sit in the same database as
  everything else: one backup, one connection string, no third-party account.
  The browser shrinks each one to 1600px before it is sent, so the server needs
  no image library and a van on a weak signal is not uploading five megabytes.
  The server checks the file's own signature rather than trusting the content
  type it was given, caps the size and the count, and marks each photo as the
  customer's or the office's - the portal query filters on that, so a picture of
  the meter cupboard cannot reach the person holding the link.
- **Money** is whole cents, totalled by one function everywhere it is summed.
  Amounts are typed in dollars, because that is what somebody says out loud, and
  converted to cents once at the edge - so nothing downstream ever sees a
  fraction of a cent.
- **A payment is believed because Stripe signed it, not because a browser came
  back.** Cards are taken through Stripe Checkout, so no card number reaches
  this server or the client and there is no publishable key to manage. The
  invoice is marked paid by the webhook alone - the success URL proves nothing,
  since anybody can visit it - and that webhook verifies the signature over the
  raw request body, which is why it is mounted ahead of the JSON parser.
  Stripe retries until acknowledged and can deliver the same event twice, so
  settling is guarded on the invoice not already being paid. A bank debit that
  completes before the money clears is left alone until the later event says
  otherwise.
- **Payments are optional.** With no Stripe keys configured the portal never
  offers to take one, `/api/health` reports `payments: false`, and everything
  else behaves exactly as before - so this can be switched on long after the
  rest is running.
- **The PDF is drawn, not screenshotted.** A quote and an invoice print from
  the same figures the customer read on their phone, summed by the same
  function - the paper can never disagree with the page. It is generated with
  pdfkit, which is plain JavaScript: the obvious alternative is headless Chrome
  rendering the web page, which would match the design exactly and pull 300MB
  of Chromium onto an instance with neither the disk nor the memory for it.
  A test inflates the finished file and reads the words back, so "the total
  reached the page" is checked rather than assumed.
- **Paperwork that has left the building cannot be quietly changed.** A quote is
  editable while it is a draft and frozen the moment it is sent; an invoice is
  frozen once it is settled. A quote may start blank, because writing one begins
  with an empty page, but an empty one cannot be sent.
- **No double-booking.** Moving a job checks the van's day and saves inside one
  transaction that also writes to the van, so two dispatchers grabbing the same
  slot at once cannot both win. A test holds two bookings between check and
  save to prove it; that is also why local Mongo runs as a one-node replica set.
- **Status rules live on the server.** It sends each person the moves they are
  allowed, and refuses a change made from a screen that is out of date.
- **Dragging is an enhancement, not the only way.** Jobs can be dragged between
  vans and hours, and the panel behind every job does the same with selects -
  which is the route on a touch screen or without a mouse.
- **Live, without polling.** Events say only that something changed and which
  day it belongs to; each screen then reloads through the API, so one set of
  permission rules decides what anyone sees. The socket cannot use the session
  cookie - it talks to the API host directly, where that cookie is
  third-party - so a page trades its cookie for a one-minute ticket, fetched
  again on every reconnect.
- **The map is a real map.** Street tiles come from OpenFreeMap, which serves
  OpenStreetMap data with no account and no key, in its dark style; the pins,
  vans and routes are ours, drawn over it.
  The map library loads only when someone opens the map, so it stays out of the
  bundle everyone else downloads. If the tiles cannot be reached the page says
  so and still shows where every job is.
- **The demo can be put back.** Everyone shares one business, so the owner has a
  reset that rebuilds today; it also rebuilds itself each morning.

## Running it locally

You need Node 22+ and either Docker or a MongoDB you can point at.

```bash
git clone https://github.com/RafBro8/kreworx.git
cd kreworx

docker compose up -d                     # MongoDB on port 27030
                                         # no Docker? npm --prefix server run db:temp

cd server && npm install
cp .env.example .env
npm run dev                              # http://localhost:4200, seeds the demo on start

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

The ops header reports the same thing - a green dot and "API connected" means
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
output directory, the SPA fallback, and the rewrite that forwards `/api` to
Render. No environment variables.

**API → Render.** [`render.yaml`](render.yaml) describes the service: root
directory `server`, health check on `/api/health`, and the free plan while
this is in build - free services sleep when idle, so move to starter before
showing the URL to anyone. Set `MONGODB_URI`, `JWT_SECRET` (any long random
string), `DEMO_MODE=true`, `PUBLIC_API_URL` (this service's own URL, where browsers open
their sockets) and `CLIENT_ORIGIN` in the dashboard.

For card payments, add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from a
Stripe sandbox, and point a Stripe webhook destination at
`/api/stripe/webhook` listening for `checkout.session.completed` and
`checkout.session.async_payment_succeeded`. Leave them out and the rest of the
system runs unchanged.

**Database → MongoDB Atlas.**

Every deploy reports which commit is live:

```bash
curl https://<api-host>/api/health
```

## Repository

```
client/   React app - ops and customer surfaces, design tokens, app shell
server/   Express API - config, routes, middleware, realtime
.github/  CI
```

## What is coming

| Stage | |
|---|---|
| 1 | **Foundation** - repo, design tokens, app shell, both deploys live |
| 2 | Data model, roles, a seeded demo business and a role switcher |
| 3 | The dispatch board and the live map |
| 4 | The customer portal - live arrival, photos, one-tap approval |
| 5 | **Quotes and invoices** - written in the app, printed as PDFs, paid by card |
| 6 | The crew's phone app - the day's stops, photos, notes |
| 7 | The owner's dashboard |
| 8 | Polish, end-to-end tests in CI |
