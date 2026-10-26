# LinkPulse

**A backend-first URL shortener built for fast redirects, reliable
asynchronous analytics, and privacy-minded tracking.**

LinkPulse shortens long URLs into compact links while keeping the
redirect path fast and moving click analytics into an asynchronous
processing pipeline. Redis serves cached redirect lookups, PostgreSQL
provides durable storage, and RabbitMQ transports click events to an
idempotent analytics worker.

## Features

### Fast, reliable redirects

-   Redis-cached short-code lookups with PostgreSQL fallback.
-   Stampede protection to reduce duplicate database work during cache
    misses.
-   Cache invalidation when link settings change.
-   Explicit link lifecycle behavior:
    -   `302` --- temporary redirect to an active destination.
    -   `403` --- access is forbidden, such as for a deactivated link.
    -   `404` --- short code does not exist.
    -   `410` --- link has expired.

### Asynchronous analytics

-   Redirect requests publish click events to RabbitMQ.
-   A separate worker processes analytics outside the redirect request
    path.
-   Idempotent event processing helps prevent duplicate analytics
    records.
-   Retries with backoff and a dead-letter queue help isolate events
    that repeatedly fail.
-   Dashboard freshness indicators make processing delays visible.

### Link management

-   Base62 short-code generation.
-   Optional custom aliases.
-   Link expiration and deactivation.
-   Destination URL and routing settings.
-   UTM parameter builder and redirect testing.

### Privacy-minded reporting

-   No raw IP addresses stored.
-   Rotating keyed visitor hashes support approximate unique-visitor
    estimates.
-   Coarse-grained country, device, browser, and referrer information.
-   Analytics distinguish successful redirect requests from verified
    human visits.

### Dashboard and telemetry

-   System overview with click totals, active links, estimated unique
    visitors, and expiring links.
-   Link list with search/filtering, status filters, sorting, and copy
    actions.
-   Per-link and aggregate analytics with time ranges and charts.
-   Routing rules and link lifecycle controls.
-   Edge telemetry for operational visibility, including queue depth,
    cache hit ratio, and latency percentiles.
-   Settings and administrative views.

## Tech stack

  Area                Technology
  ------------------- ------------------
  Frontend            React, Vite
  API                 Node.js, Fastify
  Database            PostgreSQL
  Redirect cache      Redis
  Event broker        RabbitMQ
  Local development   Docker Compose

## Architecture

``` text
Browser
   |
   v
React + Vite dashboard
   |
   v
Fastify API -----------------------> PostgreSQL
   |                                     ^
   | redirect lookup                     | cache miss / durable data
   v                                     |
 Redis <---------------------------------+
   |
   | cache hit or populated cache
   v
302 / lifecycle response

Redirect request
   |
   +----> publish click event ----> RabbitMQ ----> Analytics worker
                                                    |
                                                    v
                                                PostgreSQL
                                                    |
                                                    v
                                           Dashboard analytics
```

The redirect path is designed to avoid waiting for analytics processing.
Click events are handled asynchronously by a worker, while PostgreSQL
remains the durable source of link and analytics data.

## Getting started

### Prerequisites

Install the following tools:

-   Node.js (use the version supported by your project)
-   npm
-   Docker and Docker Compose
-   Git

### 1. Clone the repository

``` bash
git clone <your-repository-url>
cd LinkPulse
```

Replace `<your-repository-url>` with your repository's clone URL. If you
already have the project locally, open a terminal in its root directory
instead.

### 2. Configure environment variables

Create the environment files expected by your API and worker. Use the
variable names and locations defined in your project configuration.
Typical settings for this architecture include:

``` dotenv
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<database>
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://<user>:<password>@localhost:5672

# Use a strong secret from your environment; never commit it.
VISITOR_HASH_SECRET=<long-random-secret>
```

These are illustrative examples, not a guarantee of the exact variable
names used by your codebase. Check the API, worker, and Docker Compose
configuration and update the values to match your implementation. Do not
commit real credentials or secrets.

### 3. Start infrastructure

If your repository includes a Docker Compose configuration for
PostgreSQL, Redis, and RabbitMQ, start those services from the directory
containing the Compose file:

``` bash
docker compose up -d
```

Check service status:

``` bash
docker compose ps
```

If your Compose file also starts the API or worker, verify their logs:

``` bash
docker compose logs -f
```

### 4. Install dependencies

Install dependencies in the frontend, API, and worker directories
according to your repository layout. For example, if each has its own
`package.json`:

``` bash
cd client
npm install
```

Then install the API and worker dependencies in their respective
directories. If your project uses npm workspaces or a root-level
package, follow the scripts and workspace configuration in the root
`package.json` instead.

### 5. Initialize the database

Run the migrations or schema setup provided by your project before
starting the API and analytics worker. The exact command depends on the
migration tool configured in your repository; check the relevant
`package.json` scripts and database documentation.

### 6. Start the application

Start the API, analytics worker, and frontend using the scripts defined
in each package. A common local setup runs them in separate terminals:

``` bash
# Terminal 1: API
npm run dev

# Terminal 2: analytics worker
npm run worker

# Terminal 3: frontend
npm run dev
```

Run these commands from the appropriate package directories and adjust
them to match the scripts actually defined in your repository. The
frontend's Vite development server will print the local URL when it
starts.

## Using LinkPulse

1.  Sign in to the dashboard.
2.  Select **New short link** and enter a destination URL.
3.  Optionally choose a custom alias and configure an expiration.
4.  Copy the generated short URL and open it to test the redirect.
5.  Visit **Links** to search, filter, sort, and manage links.
6.  Open **Analytics** to inspect click volume, estimated unique
    visitors, referrers, countries, devices, browsers, and top links.
7.  Open **Routing Rules** to update the destination, configure
    expiration, deactivate a link, or build UTM parameters.
8.  Use **Edge Telemetry** to inspect operational signals such as queue
    depth, cache behavior, and latency.

Analytics are asynchronous, so dashboard values may appear after a short
delay while the worker processes queued events.

## Link lifecycle and response behavior

  Condition                      Expected response
  ------------------------------ --------------------------
  Active, unexpired short code   `302` temporary redirect
  Deactivated link               `403` forbidden
  Unknown short code             `404` not found
  Expired link                   `410` gone

The exact precedence for overlapping states (for example, a link that is
both expired and deactivated) follows the lifecycle checks implemented
by the API.

## Operational notes

-   **Cache invalidation:** when a destination or lifecycle setting
    changes, invalidate or refresh the corresponding Redis entry so
    future redirects use current settings.
-   **Stampede protection:** coordinate cache-miss handling so
    simultaneous requests for the same code do not trigger unnecessary
    duplicate database queries.
-   **Analytics idempotency:** use a stable event identifier or another
    durable deduplication strategy when persisting click events.
-   **Retries and dead letters:** retry transient failures with backoff
    and route exhausted messages to the dead-letter queue for
    investigation or replay.
-   **Privacy:** avoid storing raw IP addresses. Protect visitor-hash
    secrets and rotate them according to the application's privacy
    design.
-   **Telemetry:** monitor queue depth, worker failures, cache hit
    ratio, database health, and redirect latency percentiles.
-   **Secrets:** keep credentials and signing/hash secrets in
    environment configuration or a secret manager, not in source
    control.

## Development and testing

Use the scripts available in each package's `package.json` to run tests,
linting, and builds. Before deploying changes, verify at least:

-   Redirect behavior for active, unknown, expired, and deactivated
    links.
-   Cache miss fallback and cache invalidation after edits.
-   Concurrent cache misses for the same short code.
-   Duplicate event delivery and analytics idempotency.
-   Retry/backoff behavior and dead-letter routing.
-   URL validation, custom-alias conflicts, and expiration boundaries.
-   Dashboard handling when analytics processing is delayed or telemetry
    is unavailable.

## Project structure

The exact directory layout depends on your repository. A typical
organization for LinkPulse is:

``` text
LinkPulse/
├── client/                 # React + Vite dashboard
├── server/                 # Fastify API
│   ├── src/
│   │   ├── routes/         # API and redirect routes
│   │   ├── services/       # Link, cache, and analytics logic
│   │   └── ...             # Database and infrastructure modules
├── worker/                 # RabbitMQ analytics consumer (if separate)
├── docker-compose.yml
└── README.md
```

Adjust this overview to reflect the actual folders in your repository.

## Roadmap ideas

-   Shared links with QR-code generation.
-   More granular retention controls for analytics.
-   Export analytics as CSV.
-   Alerting for queue backlog or elevated redirect latency.
-   Automated integration tests for Redis and RabbitMQ failure
    scenarios.

## Contributing

1.  Create a branch for your change.
2.  Keep redirect handling fast and independent from analytics
    processing.
3.  Add or update tests for lifecycle, caching, and event-processing
    behavior.
4.  Document any new environment variables or operational requirements.
5.  Open a pull request with a clear summary and test results.

## License

Add the license used by your project here. If no license has been
selected, the project is not automatically open source simply because it
is hosted in a public repository.
