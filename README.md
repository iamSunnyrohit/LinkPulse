::: {align="center"}
# ⚡ LinkPulse

### `short links. fast redirects. async insights.`

**A backend-first URL shortener engineered for speed, reliability, and
privacy-minded analytics.**

[![Node.js](https://img.shields.io/badge/Node.js-runtime-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-API-black?logo=fastify)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-dashboard-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-storage-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-cache-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-events-FF6600?logo=rabbitmq&logoColor=white)](https://www.rabbitmq.com/)

`<br />`{=html}

> \[!TIP\] **The LinkPulse philosophy:** keep the redirect path lean,
> move analytics off the critical path, and make the system observable
> when things get weird.
:::

------------------------------------------------------------------------

## 🧭 Table of contents

-   [What is LinkPulse?](#-what-is-linkpulse)
-   [Feature set](#-feature-set)
-   [Architecture](#-architecture)
-   [Tech stack](#-tech-stack)
-   [Quick start](#-quick-start)
-   [Dashboard tour](#-dashboard-tour)
-   [Redirect lifecycle](#-redirect-lifecycle)
-   [Engineering notes](#-engineering-notes)
-   [Testing checklist](#-testing-checklist)
-   [Possible next quests](#-possible-next-quests)
-   [Contributing](#-contributing)
-   [License](#-license)

## 🧩 What is LinkPulse?

LinkPulse turns long URLs into compact, shareable links---and gives you
a dashboard to understand how those links are used.

Under the hood, it combines **Redis** for fast redirect lookups,
**PostgreSQL** for durable data, and **RabbitMQ** to move click events
to an asynchronous analytics worker. That means analytics work doesn't
need to block the redirect response.

Think of it as a tiny traffic-control tower for your links. 🚦

``` text
Long URL  ──►  Short code  ──►  Fast redirect
                    │
                    └────────► Event queue ──► Analytics worker ──► Dashboard
```

## ✨ Feature set

### 🏎️ Redirects in the fast lane

-   Redis-cached short-code lookups with PostgreSQL fallback.
-   Stampede protection to reduce duplicate database work during cache
    misses.
-   Cache invalidation when link settings are edited.
-   Base62 short-code generation.
-   Custom aliases for memorable links.

### 📨 Analytics without the traffic jam

-   Click events are published to RabbitMQ.
-   A separate worker processes analytics asynchronously.
-   Idempotent event processing helps protect against duplicate
    deliveries.
-   Retries with backoff and a dead-letter queue help handle repeated
    failures.
-   Dashboard freshness indicators make processing delays visible.

### 🛠️ Link controls

-   Update destination URLs and routing settings.
-   Set expiration dates or deactivate a link.
-   Build UTM parameters.
-   Test redirects and copy short links.
-   Handle link lifecycle states with explicit HTTP responses.

### 🕵️ Privacy-minded by design

-   No raw IP addresses stored.
-   Rotating keyed visitor hashes support approximate unique-visitor
    estimates.
-   Reporting uses coarse country, device, browser, and referrer
    information.
-   Click counts represent successful redirect requests---not verified
    human visits.

### 📊 Dashboard + observability

-   System overview: clicks, active links, estimated unique visitors,
    and links expiring soon.
-   Searchable and filterable link management.
-   Aggregate and per-link analytics with time ranges and charts.
-   Routing rules and lifecycle controls.
-   Edge telemetry for queue depth, cache hit ratio, and latency
    percentiles.

## 🏗️ Architecture

``` mermaid
flowchart TD
    U[Browser / Client] --> API[Fastify API]
    API -->|Lookup short code| R[(Redis cache)]
    R -->|Cache miss| DB[(PostgreSQL)]
    DB -->|Populate cache| R
    R -->|Resolved link| REDIR[302 Redirect]
    API -->|Publish click event| MQ[[RabbitMQ]]
    MQ --> W[Analytics worker]
    W -->|Idempotent writes| DB
    DB --> DASH[React + Vite dashboard]
    API -. telemetry .-> TEL[Edge telemetry]
    W -. queue / worker stats .-> TEL
```

**Design goal:** keep redirect handling small and predictable. Analytics
events travel through the queue and are persisted by the worker,
separately from the user's redirect response.

## 🧰 Tech stack

  -----------------------------------------------------------------------
  Layer                   Technology              Job
  ----------------------- ----------------------- -----------------------
  Frontend                React + Vite            Dashboard UI

  API                     Node.js + Fastify       Link management and
                                                  redirects

  Durable storage         PostgreSQL              Links and analytics
                                                  data

  Cache                   Redis                   Fast redirect lookups

  Message broker          RabbitMQ                Async click-event
                                                  delivery

  Local infrastructure    Docker Compose          Run supporting services
                                                  locally
  -----------------------------------------------------------------------

## 🚀 Quick start

> \[!IMPORTANT\] The commands and environment variables below are
> **templates**. Check your repository's `package.json`, Docker Compose
> file, migrations, and configuration for the exact names used by your
> implementation.

### 0. Prerequisites

-   Node.js and npm
-   Docker + Docker Compose
-   Git

### 1. Clone the repo

``` bash
git clone <your-repository-url>
cd LinkPulse
```

Replace `<your-repository-url>` with your Git repository URL. Already
have the project locally? Just open a terminal in its root folder.

### 2. Configure environment variables

Create the environment files required by your API and worker. A typical
configuration might look like this:

``` dotenv
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<database>
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://<user>:<password>@localhost:5672

# Generate a strong secret. Never commit real secrets.
VISITOR_HASH_SECRET=<long-random-secret>
```

Your actual variable names, ports, and file locations may differ. Use
the names expected by your code. Keep credentials out of Git.

### 3. Start the infrastructure

If your Compose file defines PostgreSQL, Redis, and RabbitMQ:

``` bash
docker compose up -d
docker compose ps
```

Peek at service logs when debugging:

``` bash
docker compose logs -f
```

### 4. Install dependencies

Install dependencies in the directories that contain your app packages.
For example:

``` bash
cd client
npm install
```

Repeat for the API and worker packages if they have separate
`package.json` files. If the repository uses npm workspaces or
root-level scripts, follow that setup instead.

### 5. Prepare the database

Run the migrations or schema initialization command provided by the
project. The exact command depends on the migration tool and scripts
configured in your repository.

### 6. Start the app

Run the scripts defined in your packages. In a multi-package setup, you
may run the API, worker, and frontend in separate terminals:

``` bash
# Terminal 1 — API (example script)
npm run dev

# Terminal 2 — worker (example script)
npm run worker

# Terminal 3 — frontend (example script)
npm run dev
```

Run each command from the correct package directory and adjust it to
match your actual scripts. Vite prints the frontend URL after it starts.

## 🖥️ Dashboard tour

  -----------------------------------------------------------------------
  Section                             What you'll find
  ----------------------------------- -----------------------------------
  **Overview**                        Click totals, active links,
                                      approximate visitors, expiring
                                      links, and click volume

  **Links**                           Search, status filters, sorting,
                                      destination details, and copy
                                      actions

  **Analytics**                       Click trends, top links, referrers,
                                      countries, devices, and browsers

  **Routing Rules**                   Destination editing, expiration,
                                      deactivation, redirect testing, and
                                      UTM builder

  **Edge Telemetry**                  Operational signals such as queue
                                      depth, cache hit ratio, and latency
                                      percentiles

  **Settings**                        Application and account settings
                                      exposed by the current build
  -----------------------------------------------------------------------

### 🧪 Try the happy path

1.  Sign in to LinkPulse.
2.  Click **New short link** and add a destination URL.
3.  Optionally set a custom alias or expiry.
4.  Copy the generated short URL and open it in a new tab.
5.  Return to the dashboard and check the link's click count.
6.  Open **Analytics** to explore available breakdowns.
7.  Change a routing setting and test the redirect again.

**Tiny heads-up:** analytics are asynchronous. A click can redirect
successfully before its event appears in the dashboard. A little queue
time is expected.

## 🔀 Redirect lifecycle

  ------------------------------------------------------------------------
  Situation                        Expected response Meaning
  --------------------- ---------------------------- ---------------------
  Active, unexpired                            `302` Temporarily redirect
  link                                               to the destination

  Deactivated link                             `403` Access is forbidden

  Unknown short code                           `404` No matching link
                                                     exists

  Expired link                                 `410` The resource is gone
  ------------------------------------------------------------------------

If a link is both expired and deactivated, which response wins depends
on the order of lifecycle checks in the implementation.

## 🧠 Engineering notes

```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}⚡ Cache strategy`</strong>`{=html}
```{=html}
</summary>
```
-   Treat PostgreSQL as durable storage and Redis as the fast lookup
    layer.
-   Invalidate or refresh cached entries after edits and lifecycle
    changes.
-   Coordinate concurrent cache misses to avoid a thundering herd of
    database queries.
-   Monitor cache hit ratio and redirect latency together; one metric
    rarely tells the whole story.

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}📬 Queue reliability`</strong>`{=html}
```{=html}
</summary>
```
-   Assume message delivery can happen more than once.
-   Use a stable event identifier or another durable deduplication
    strategy.
-   Retry transient failures with backoff.
-   Route repeatedly failing messages to a dead-letter queue for
    inspection and controlled replay.
-   Monitor queue depth, consumer health, processing failures, and event
    freshness.

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}🔐 Privacy and security`</strong>`{=html}
```{=html}
</summary>
```
-   Do not store raw IP addresses.
-   Protect visitor-hash secrets and rotate them according to the
    privacy design.
-   Validate destination URLs and custom aliases.
-   Keep database credentials and service secrets out of source control.
-   Apply appropriate authentication and authorization to management and
    telemetry endpoints.

```{=html}
</details>
```
```{=html}
<details>
```
```{=html}
<summary>
```
`<strong>`{=html}🔭 Observability`</strong>`{=html}
```{=html}
</summary>
```
Useful signals include:

-   Redirect latency percentiles (p50, p95, p99).
-   Redis hit/miss ratio and database fallback rate.
-   RabbitMQ queue depth and consumer throughput.
-   Worker retries, failures, and dead-letter count.
-   Time between click event creation and analytics visibility.

```{=html}
</details>
```
## 🧯 Testing checklist

Before shipping a change, consider checking:

-   [ ] Active, unknown, expired, and deactivated link responses.
-   [ ] Cache miss fallback and cache invalidation after edits.
-   [ ] Concurrent misses for the same short code.
-   [ ] Duplicate event delivery and analytics idempotency.
-   [ ] Retry/backoff behavior and dead-letter routing.
-   [ ] URL validation and custom-alias conflicts.
-   [ ] Expiration boundaries and timezone handling.
-   [ ] Dashboard behavior while analytics are delayed.
-   [ ] Graceful behavior when Redis, RabbitMQ, or the worker is
    unavailable.
-   [ ] Authentication and authorization on protected routes.

Use the test, lint, and build scripts already defined in your package
files; exact commands vary by repository.

## 🗺️ Possible next quests

A few ideas for the next sprint:

-   [ ] QR-code generation for short links.
-   [ ] CSV export for analytics.
-   [ ] Alerts for growing queue backlog or elevated redirect latency.
-   [ ] Configurable analytics retention.
-   [ ] Integration tests for Redis and RabbitMQ failure scenarios.
-   [ ] A local development health-check command.
-   [ ] Link previews and social sharing metadata.

## 🤝 Contributing

Got a useful improvement? Awesome. 🛠️

1.  Create a branch for your change.
2.  Keep the redirect path fast and independent from analytics
    processing.
3.  Add tests for lifecycle, caching, and event handling where
    appropriate.
4.  Document new environment variables and operational behavior.
5.  Open a pull request with a clear summary and test results.

## 📄 License

Add your project's chosen license here. A public GitHub repository is
not automatically open source without a license.

------------------------------------------------------------------------

::: {align="center"}
**Built for the redirect. Designed for the details.** ⚡

`ship code` · `watch queues` · `follow the pulse`
:::
