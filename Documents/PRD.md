# **Product Requirements Document: URL Shortener \+ Click Analytics**

**Version: 1.0**  
**Status: Proposed specification**  
**Product type: Backend-first web application with an analytics dashboard**  
**Working name: LinkPulse**

## **1\. Product summary**

**Build a URL shortener that turns long URLs into compact, shareable links and records analytics whenever those links receive traffic.**

**The product’s differentiator is analytics: redirects should remain fast while click events are processed asynchronously into useful reports.**

**The concept in your screenshot calls for Base62-generated short codes, cached redirects, asynchronous click tracking, optional custom aliases, expiration dates, link deactivation, and analytics. It also suggests QR codes and a live dashboard as stretch goals. This PRD expands that concept into an implementation-ready product specification; details beyond those visible requirements are proposed design decisions.**

### **Core user journey**

1. **A user creates an account.**  
2. **They submit a destination URL.**  
3. **The system returns a short link.**  
4. **The user shares the short link.**  
5. **Visitors open it and are redirected.**  
6. **The system records click events without waiting for analytics processing.**  
7. **The link owner views aggregate traffic, referrers, device categories, browsers, and countries.**  
8. **The owner can change the destination, expire, or deactivate the link.**

---

## **2\. Problem statement**

**Basic URL shorteners solve link length but provide little insight into what happens after a link is shared.**

**Users need to answer:**

* **How often was this link opened?**  
* **Where did visitors come from?**  
* **Which channels drove traffic?**  
* **What devices and browsers did visitors use?**  
* **When did traffic peak?**  
* **Is the link still active and safe to share?**

**From an engineering perspective, the challenge is to combine a low-latency redirect path with a reliable analytics pipeline, without making every redirect wait for database writes and aggregation.**

---

## **3\. Goals and non-goals**

### **Product goals**

* **Create short links quickly and predictably.**  
* **Support custom aliases with collision detection.**  
* **Redirect visitors with low application latency.**  
* **Capture useful traffic analytics asynchronously.**  
* **Give users clear lifecycle controls.**  
* **Handle popular links without proportional load on the primary database.**  
* **Provide clear privacy, abuse, and operational safeguards.**

### **Engineering goals**

* **Demonstrate a complete backend architecture rather than CRUD alone.**  
* **Separate redirect serving from event processing.**  
* **Make event consumption idempotent.**  
* **Define measurable latency, freshness, and availability targets.**  
* **Make failures visible through metrics and logs.**

### **MVP non-goals**

* **Advertising or monetized interstitial pages.**  
* **Billing and subscription plans.**  
* **Team workspaces.**  
* **Custom domains.**  
* **Geographic or device-based destination routing.**  
* **A/B testing.**  
* **Deep links into mobile applications.**  
* **Marketing attribution across multiple websites.**  
* **Exact identification of individual visitors.**  
* **Crawling destinations to generate previews.**

---

## **4\. Target users**

| Persona | Primary need | Example use |
| ----- | ----- | ----- |
| **Content creator** | **Understand traffic from shared links** | **Compare social-media referrals** |
| **Marketer** | **Measure campaign distribution** | **Track links shared through newsletters** |
| **Developer** | **Create links programmatically** | **Generate links from another application** |
| **Small-business owner** | **Manage reusable promotional links** | **Update the destination behind a printed QR code** |

**The initial release targets individual users rather than organizations.**

---

## **5\. Scope and release plan**

### **MVP**

* **Account registration, login, and password reset.**  
* **Create a generated short link.**  
* **Create a custom alias.**  
* **List and search owned links.**  
* **Edit a destination URL.**  
* **Set or update an expiration date.**  
* **Deactivate and reactivate links.**  
* **Fast redirects backed by a cache.**  
* **Asynchronous click ingestion.**  
* **Per-link analytics dashboard.**  
* **Basic abuse reporting and administrative blocking.**  
* **Observability and deployment documentation.**

### **Phase 2**

* **QR-code generation.**  
* **Dashboard refresh every 30 seconds.**  
* **CSV analytics export.**  
* **Scoped API keys.**  
* **Bulk link creation.**  
* **Expanded bot classification.**  
* **Configurable analytics retention.**

### **Phase 3**

* **Custom domains.**  
* **Team workspaces and roles.**  
* **Webhooks.**  
* **Campaign grouping.**  
* **Advanced routing and integrations.**

---

## **6\. User stories**

| ID | User story | Priority |
| ----- | ----- | ----- |
| **US-01** | **As a user, I want to shorten a URL so I can share it easily.** | **P0** |
| **US-02** | **As a user, I want a memorable alias so my link is recognizable.** | **P0** |
| **US-03** | **As a visitor, I want an active link to redirect immediately.** | **P0** |
| **US-04** | **As a link owner, I want to see click trends and traffic breakdowns.** | **P0** |
| **US-05** | **As a link owner, I want to expire or deactivate a link.** | **P0** |
| **US-06** | **As a link owner, I want to update the destination without changing the short link.** | **P0** |
| **US-07** | **As a user, I want to search my links by title, code, or destination.** | **P1** |
| **US-08** | **As an administrator, I want to block abusive links.** | **P0** |
| **US-09** | **As a user, I want a QR code for a short link.** | **P2** |
| **US-10** | **As a developer, I want an API key for programmatic creation.** | **P2** |

**P0 is required for launch, P1 improves the first release, and P2 follows the MVP.**

---

## **7\. Functional requirements**

### **7.1 Accounts and ownership**

* **Users must authenticate to create or manage links.**  
* **Each link belongs to exactly one account.**  
* **Only its owner or an authorized administrator may modify it or access its analytics.**  
* **Public visitors do not need an account to follow a short link.**  
* **Password-reset tokens must expire and be single-use.**  
* **Account and administrative actions must be auditable.**

**Acceptance criteria:**

* **Requests for another user’s link-management or analytics resources do not expose the resource.**  
* **Unauthenticated management requests return `401`.**  
* **Administrative access is explicitly authorized and logged.**

### **7.2 Create a short link**

**Inputs:**

| Field | Required | Rules |
| ----- | ----- | ----- |
| **`destination_url`** | **Yes** | **Absolute HTTP or HTTPS URL** |
| **`custom_alias`** | **No** | **3–32 characters; letters, numbers, hyphens, underscores** |
| **`title`** | **No** | **Maximum 120 characters** |
| **`expires_at`** | **No** | **Future timestamp with explicit timezone** |

**Proposed validation rules:**

* **Maximum destination length: 8,192 characters.**  
* **Reject unsupported schemes such as `javascript:`, `data:`, and `file:`.**  
* **Reject embedded URL credentials.**  
* **Reject localhost, loopback, private-network literal IPs, and known application-internal hosts.**  
* **Reject direct destinations on the short-link domain to prevent straightforward redirect loops.**  
* **Do not fetch the destination during creation.**  
* **Preserve meaningful path, query-string, and fragment content.**  
* **Reject reserved aliases such as `api`, `admin`, `login`, and `health`.**

**Output:**

* **Link ID.**  
* **Short code.**  
* **Full short URL.**  
* **Destination.**  
* **Lifecycle status.**  
* **Creation and expiration timestamps.**

**Acceptance criteria:**

* **A valid request returns `201`.**  
* **Invalid input returns `422` with field-specific errors.**  
* **An unavailable alias returns `409`.**  
* **Creation does not require the destination website to be online.**  
* **Retrying a request with the same valid idempotency key does not create a duplicate link.**

### **7.3 Generated short codes**

**Proposed approach:**

* **Allocate a unique positive integer from a database sequence.**  
* **Encode that integer using a fixed Base62 alphabet.**  
* **Enforce uniqueness through a database constraint.**  
* **Keep generated codes and aliases in the same namespace.**  
* **Skip generated values already occupied by custom aliases.**

**Important limitation: Base62 encoding is an identifier representation, not an access-control mechanism. Private content must remain protected at its destination.**

**Aliases and generated codes are case-sensitive in the MVP. This behavior must be explained in the creation UI.**

**Codes must never be reassigned to different links.**

### **7.4 Redirect behavior**

**Route:**

**GET /{short\_code}**

**Processing:**

1. **Validate the code’s syntax.**  
2. **Retrieve redirect metadata from cache.**  
3. **On cache miss, load the link from the database.**  
4. **Check administrative block, activation state, and expiration.**  
5. **Produce a click event for eligible requests.**  
6. **Return the redirect without waiting for analytics processing.**

**Response rules:**

| Condition | Response |
| ----- | ----- |
| **Active, unexpired link** | **`302 Found`** |
| **Unknown code** | **`404 Not Found`** |
| **Expired link** | **`410 Gone`** |
| **Owner-deactivated link** | **`403 Forbidden`** |
| **Administrator-blocked link** | **`403 Forbidden`** |

**Additional requirements:**

* **Use `302`, not a permanent redirect, because destinations may change.**  
* **Set `Cache-Control: no-store` on redirects and lifecycle error responses.**  
* **Include the exact validated destination in `Location`.**  
* **Support `HEAD` with equivalent status and headers, but do not count it as a click.**  
* **Do not count failed or blocked redirects as successful clicks.**

### **7.5 Link lifecycle management**

**Owners can:**

* **Edit the title.**  
* **Change the destination.**  
* **Add, remove, or change expiration.**  
* **Deactivate a link.**  
* **Reactivate a link.**

**Rules:**

* **Short codes remain immutable.**  
* **An expired link can become active again only after its expiration is removed or extended.**  
* **Reactivation does not bypass an administrative block.**  
* **Destination changes affect future redirects, not historical analytics.**  
* **Cache invalidation is required after lifecycle or destination changes.**  
* **Hard deletion and code reuse are outside MVP scope.**

**Lifecycle precedence:**

1. **Administratively blocked.**  
2. **Deactivated.**  
3. **Expired.**  
4. **Active.**

### **7.6 Click-event capture**

**A click event represents a successful redirect request, not a verified human visit or a confirmed destination-page load.**

**Proposed event structure:**

**{**  
  **"event\_id": "uuid",**  
  **"schema\_version": 1,**  
  **"link\_id": "uuid",**  
  **"occurred\_at": "2026-10-26T07:30:00Z",**  
  **"country\_code": "IN",**  
  **"device\_type": "mobile",**  
  **"browser\_family": "Chrome",**  
  **"os\_family": "Android",**  
  **"referrer\_host": "example.com",**  
  **"visitor\_hash": "rotating-pseudonymous-value",**  
  **"bot\_classification": "unknown"**  
**}**

**Requirements:**

* **Generate the event ID before publication.**  
* **Use server-side timestamps in UTC.**  
* **Derive country from the request IP using a local lookup database where practical.**  
* **Parse the user agent into coarse categories.**  
* **Store referrer hostname only, not its path or query string.**  
* **Represent missing data as `unknown`.**  
* **Do not retain raw IP addresses in the analytics dataset.**  
* **Ensure proxy headers are trusted only from configured infrastructure.**

### **7.7 Asynchronous processing**

**The analytics pipeline must:**

* **Accept events independently of aggregation.**  
* **Retry transient failures.**  
* **Support at-least-once delivery.**  
* **Deduplicate repeated event IDs.**  
* **Route persistently failing events to a dead-letter queue.**  
* **Support replay without double-counting.**  
* **Expose queue lag, failure rate, and dropped-event metrics.**

**Failure policy:**

* **Redirect availability takes precedence over analytics completeness.**  
* **The redirect path may wait only a small, configured budget for broker acknowledgement.**  
* **If publication fails, use a bounded fallback buffer where available.**  
* **If no durable path succeeds within the latency budget, redirect anyway and increment a dropped-event metric.**

**This means the MVP targets high analytics completeness, not mathematically lossless counting.**

### **7.8 Analytics dashboard**

**Per-link dashboard:**

* **Total successful redirect requests.**  
* **Estimated unique visitors.**  
* **Clicks over time.**  
* **Top countries.**  
* **Device categories.**  
* **Browser families.**  
* **Referrer hosts.**  
* **Known-bot traffic, shown separately when identifiable.**  
* **Last processed event time.**  
* **Analytics freshness indicator.**

**Date ranges:**

* **Last 24 hours.**  
* **Last 7 days.**  
* **Last 30 days.**  
* **Custom range within retention.**

**Definitions:**

* **Total clicks: eligible successful `GET` redirect requests.**  
* **Estimated unique visitors: distinct rotating visitor hashes within each reporting period.**  
* **Direct/unknown referrer: no usable referrer hostname.**  
* **Known-bot clicks: traffic classified as automated by the configured rules.**  
* **Unknown traffic: traffic that cannot be reliably classified.**

**The UI must not describe “not identified as a bot” as “verified human.”**

**Unique counts must be computed for the requested period; daily unique counts must not simply be added together.**

### **7.9 Abuse controls**

* **Public abuse-report submission.**  
* **Administrative review queue.**  
* **Ability to block links and suspend accounts.**  
* **Reason codes and audit history.**  
* **Rate limits on creation, login, and reporting endpoints.**  
* **Configurable destination denylist.**

**Known limitation: basic URL validation cannot establish that a destination is safe. Automated destination scanning is a later capability unless a dedicated service is included at launch.**

---

## **8\. User interface requirements**

### **Authentication**

* **Register.**  
* **Sign in.**  
* **Reset password.**

### **Link list**

* **Create-link button.**  
* **Search and status filtering.**  
* **Title, destination, short URL, status, creation date, expiration, and click count.**  
* **Copy-link action.**  
* **Edit and deactivate actions.**  
* **Pagination.**

### **Create/edit form**

* **Destination.**  
* **Optional alias during creation.**  
* **Title.**  
* **Expiration.**  
* **Validation errors.**  
* **Preview of the resulting short URL.**

### **Link details**

* **Copyable short link.**  
* **Destination and lifecycle controls.**  
* **Analytics summary.**  
* **Time-series chart.**  
* **Traffic-breakdown tables.**  
* **Freshness timestamp.**  
* **Clear empty, loading, delayed-processing, and error states.**

### **Public error pages**

**Separate messages for unknown, expired, inactive, and blocked links. Do not expose account information or internal identifiers.**

---

## **9\. API specification**

**Use `/api/v1` for authenticated product endpoints and the root namespace for public redirects.**

| Method | Endpoint | Purpose |
| ----- | ----- | ----- |
| **POST** | **`/api/v1/auth/register`** | **Register** |
| **POST** | **`/api/v1/auth/login`** | **Sign in** |
| **POST** | **`/api/v1/auth/logout`** | **Sign out** |
| **POST** | **`/api/v1/auth/password-reset`** | **Request reset** |
| **POST** | **`/api/v1/links`** | **Create link** |
| **GET** | **`/api/v1/links`** | **List owned links** |
| **GET** | **`/api/v1/links/{id}`** | **Retrieve link** |
| **PATCH** | **`/api/v1/links/{id}`** | **Update link** |
| **GET** | **`/api/v1/links/{id}/analytics`** | **Retrieve analytics** |
| **POST** | **`/api/v1/reports`** | **Report abuse** |
| **GET/HEAD** | **`/{short_code}`** | **Resolve link** |

### **Create request**

**{**  
  **"destination\_url": "https\://example.com/articles/backend-design",**  
  **"custom\_alias": "backend-guide",**  
  **"title": "Backend guide",**  
  **"expires\_at": "2026-12-31T23:59:59Z"**  
**}**

### **Create response**

**{**  
  **"id": "b447edbd-f5cd-4929-98f6-a628acf8548b",**  
  **"short\_code": "backend-guide",**  
  **"short\_url": "https\://sho.rt/backend-guide",**  
  **"destination\_url": "https\://example.com/articles/backend-design",**  
  **"title": "Backend guide",**  
  **"status": "active",**  
  **"expires\_at": "2026-12-31T23:59:59Z",**  
  **"created\_at": "2026-10-26T07:30:00Z"**  
**}**

**The domain above is illustrative, not a deployment requirement.**

### **Analytics request**

**GET /api/v1/links/{id}/analytics**  
    **?from=2026-10-01T00:00:00Z**  
    **\&to=2026-11-01T00:00:00Z**  
    **\&interval=day**

**Use inclusive `from` and exclusive `to` boundaries.**

### **Standard error format**

**{**  
  **"error": {**  
    **"code": "ALIAS\_UNAVAILABLE",**  
    **"message": "This alias is already in use.",**  
    **"request\_id": "req\_123",**  
    **"details": {**  
      **"field": "custom\_alias"**  
    **}**  
  **}**  
**}**

**Other error codes include:**

* **`INVALID_URL`**  
* **`INVALID_EXPIRATION`**  
* **`RESERVED_ALIAS`**  
* **`RATE_LIMITED`**  
* **`UNAUTHORIZED`**  
* **`LINK_NOT_FOUND`**

---

## **10\. Data model**

| Entity | Key fields |
| ----- | ----- |
| **`users`** | **`id`, `email`, `password_hash`, `status`, timestamps** |
| **`links`** | **`id`, `sequence_id`, `owner_id`, `short_code`, `destination_url`, `title`, `is_active`, `blocked_at`, `expires_at`, `version`, timestamps** |
| **`click_events`** | **`event_id`, `link_id`, `occurred_at`, country, device, browser, OS, referrer, visitor hash, bot classification** |
| **`click_aggregates`** | **`link_id`, bucket start, granularity, dimension type, dimension value, count** |
| **`abuse_reports`** | **`id`, `link_id`, reason, review status, timestamps** |
| **`audit_logs`** | **actor, action, target, timestamp, safe metadata** |
| **`idempotency_keys`** | **owner, key, request fingerprint, response, expiry** |

**Required indexes:**

* **Unique `users.email`.**  
* **Unique `links.short_code`.**  
* **Unique `links.sequence_id`.**  
* **`links(owner_id, created_at)`.**  
* **Unique retained `click_events.event_id`.**  
* **`click_events(link_id, occurred_at)`.**  
* **Unique aggregate bucket and dimension key.**

**Do not create a single aggregate table containing every combination of country, browser, device, and referrer; the MVP only needs independent breakdowns.**

---

## **11\. Proposed architecture**

**Browser / API client**  
        **\|**  
        **v**  
**Load balancer**  
        **\|**  
        **\+--\> Management API \------\> PostgreSQL**  
        **\|         \|**  
        **\|         \+---------------\> Cache invalidation**  
        **\|**  
        **\+--\> Redirect service \----\> Redis**  
                   **\|                 \|**  
                   **\|                 \+--\> Database fallback**  
                   **\|**  
                   **\+--\> Durable event broker**  
                               **\|**  
                               **v**  
                       **Analytics workers**  
                               **\|**  
                               **v**  
                    **Events \+ aggregate storage**  
                               **\|**  
                               **v**  
                         **Analytics API**  
                               **\|**  
                               **v**  
                            **Dashboard**

### **Reference implementation**

**A reasonable portfolio implementation could use:**

* **TypeScript with NestJS or Fastify.**  
* **PostgreSQL.**  
* **Redis.**  
* **RabbitMQ for durable event transport.**  
* **React or Next.js for the dashboard.**  
* **Docker Compose locally.**

**These are proposed implementation choices, not mandatory product requirements. A modular application with separate redirect and worker processes is sufficient for the MVP; independent microservices are not required.**

### **Cache behavior**

**Cache key:**

**link:{short\_code}**

**Cached value:**

* **Link ID.**  
* **Destination.**  
* **Activation and block state.**  
* **Expiration.**  
* **Version.**

**Requirements:**

* **Use a bounded TTL, initially 60 seconds.**  
* **Check expiration on every request, including cache hits.**  
* **Invalidate immediately after successful edits.**  
* **Use short negative caching for unknown codes.**  
* **Protect against cache stampedes.**  
* **Ensure stale refill races cannot extend an outdated value indefinitely.**  
* **Treat the database as authoritative.**

**Proposed consistency contract: changes normally propagate within two seconds; fallback staleness is bounded by the cache TTL.**

---

## **12\. Non-functional requirements**

**All figures below are proposed acceptance targets, not measured results.**

| Area | Target |
| ----- | ----- |
| **Cached redirect latency** | **p95 ≤ 50 ms** |
| **Uncached redirect latency** | **p95 ≤ 150 ms** |
| **Create-link latency** | **p95 ≤ 300 ms** |
| **Common analytics queries** | **p95 ≤ 1 second** |
| **Analytics freshness** | **p95 ≤ 30 seconds** |
| **Redirect availability** | **99.9% monthly target** |
| **Cache hit rate** | **≥ 95% during steady-state benchmark** |
| **Normal-operation analytics completeness** | **≥ 99.9% against controlled load-generator counts** |
| **Cache consistency** | **Normally ≤ 2 seconds; bounded fallback ≤ 60 seconds** |

**Latency measurements run from application ingress to response headers. They exclude visitor network time, TLS setup outside the application, and destination-page loading.**

### **Initial benchmark workload**

* **100,000 stored links.**  
* **500 sustained redirects per second.**  
* **2,000 redirects per second for a 60-second burst.**  
* **Mixed hot-link and long-tail traffic.**  
* **Concurrent link edits and analytics queries.**

**The test report must record hardware, deployment topology, cache warmth, duration, and error rates.**

---

## **13\. Security and privacy requirements**

* **HTTPS for public traffic.**  
* **Secure, HTTP-only session cookies for browser authentication.**  
* **CSRF protection where cookie-based authentication requires it.**  
* **Modern password hashing through a maintained authentication library.**  
* **Object-level authorization on every management endpoint.**  
* **Parameterized database queries.**  
* **Escaped dashboard output.**  
* **Secrets stored outside source control.**  
* **Rate limits configurable by account and source IP.**  
* **No full destination URLs, raw referrers, or credentials in routine logs.**  
* **Separate administrative permissions.**  
* **Dependency and container vulnerability checks before release.**

### **Analytics privacy**

**Proposed policy:**

* **Raw IPs are processed transiently for country lookup and visitor-hash generation.**  
* **Visitor hashes use a rotating keyed construction rather than an unkeyed IP hash.**  
* **Raw click events are retained for 30 days.**  
* **Aggregate reports are retained for 12 months.**  
* **Operational logs have a separate, short retention period.**  
* **Account-deletion workflows remove owned analytics according to a documented deletion schedule.**

**Visitor estimates are pseudonymous and approximate, not anonymous guarantees. Applicable privacy notices, consent rules, and retention obligations require jurisdiction-specific review before public deployment.**

---

## **14\. Reliability and failure behavior**

| Failure | Required behavior |
| ----- | ----- |
| **Redis unavailable** | **Fall back to database within protective concurrency limits** |
| **Database unavailable** | **Serve valid cached links; return `503` for unresolved misses** |
| **Event broker unavailable** | **Use bounded fallback; preserve redirect availability** |
| **Analytics worker unavailable** | **Retain queued events and expose processing delay** |
| **Duplicate event** | **Deduplicate without inflating counts** |
| **Invalid event** | **Quarantine in dead-letter queue** |
| **Geolocation lookup unavailable** | **Record country as unknown** |
| **User-agent parsing failure** | **Record unknown categories** |
| **Dashboard unavailable** | **Redirect service remains operational** |

**Do not turn dependency outages into misleading `404` responses.**

---

## **15\. Observability**

**Required metrics:**

* **Redirect request rate, latency, and status distribution.**  
* **Cache hit/miss rate.**  
* **Database fallback rate.**  
* **Event publication latency and failures.**  
* **Dropped-event count.**  
* **Queue depth and oldest-event age.**  
* **Worker retry and dead-letter rates.**  
* **Analytics freshness.**  
* **Link-creation errors.**  
* **Cache invalidation failures.**

**Initial alerts:**

* **Redirect `5xx` rate above 1% for five minutes.**  
* **Redirect p95 above 100 ms for five minutes.**  
* **Oldest queued event above 60 seconds.**  
* **Any sustained event dropping.**  
* **Dead-letter queue growth.**  
* **Elevated database fallback after cache failures.**

**Logs should carry a request ID and safe internal identifiers without unnecessarily recording visitor data.**

---

## **16\. Testing requirements**

### **Unit tests**

* **Base62 encoding.**  
* **Alias validation and reservation.**  
* **URL validation.**  
* **Expiration boundaries.**  
* **Lifecycle precedence.**  
* **User-agent parsing.**  
* **Visitor-hash rotation.**  
* **Event deduplication.**

### **Integration tests**

* **Link creation through resolution.**  
* **Concurrent alias claims.**  
* **Cache miss and refill.**  
* **Destination edits and invalidation.**  
* **Expiry during cache residency.**  
* **Duplicate event delivery.**  
* **Worker retry and replay.**  
* **Ownership enforcement.**  
* **Broker and database failures.**

### **End-to-end tests**

1. **Register and sign in.**  
2. **Create a link.**  
3. **Follow it.**  
4. **Confirm analytics appears within the freshness target.**  
5. **Change its destination.**  
6. **Confirm redirects use the new destination.**  
7. **Deactivate it and verify `403`.**  
8. **Reactivate it.**  
9. **Expire it and verify `410`.**

### **Load and recovery tests**

* **Steady load and burst traffic.**  
* **Single viral link.**  
* **Random unknown-code traffic.**  
* **Cache restart.**  
* **Worker shutdown and recovery.**  
* **Broker outage.**  
* **Database outage.**  
* **Replaying already-processed events.**

---

## **17\. Delivery milestones**

| Milestone | Deliverable | Exit criterion |
| ----- | ----- | ----- |
| **M1: Foundation** | **Authentication, schema, CI, local deployment** | **Ownership and account tests pass** |
| **M2: Link engine** | **Generation, aliases, redirects, lifecycle controls** | **Redirect behavior passes E2E tests** |
| **M3: Performance** | **Cache, invalidation, rate limits** | **Redirect benchmark meets targets** |
| **M4: Event pipeline** | **Broker, workers, deduplication, retries** | **Replay does not double-count** |
| **M5: Analytics** | **Aggregation API and dashboard** | **Controlled counts and freshness verified** |
| **M6: Hardening** | **Abuse controls, monitoring, failure tests** | **Launch checklist complete** |
| **M7: Polish** | **Documentation and demonstration** | **Reproducible local setup and recorded demo** |

---

## **18\. Launch acceptance checklist**

**The MVP is ready when:**

* **A user can create, share, manage, and inspect a link.**  
* **Concurrent alias requests cannot create duplicate codes.**  
* **Active, missing, expired, inactive, and blocked links return the specified responses.**  
* **Cached redirects meet the documented benchmark target.**  
* **Analytics processing does not wait on the redirect response path.**  
* **Duplicate event delivery cannot inflate analytics.**  
* **Destination edits invalidate cached metadata within the stated consistency contract.**  
* **Broker failures do not silently disappear from monitoring.**  
* **Analytics clearly distinguishes requests, estimates, and unknown classifications.**  
* **Cross-account access tests pass.**  
* **Rate limits, abuse blocking, privacy retention, and operational alerts are configured.**  
* **A fresh developer environment can run the application using the documented setup.**

## **19\. Key trade-offs**

* **Speed versus completeness: redirects continue during analytics outages, so rare event loss is explicitly measurable rather than hidden.**  
* **Fast caching versus immediate edits: invalidation handles the normal case, while a short TTL bounds stale behavior.**  
* **Useful analytics versus privacy: coarse dimensions and rotating identifiers provide insight without retaining raw IPs in analytics.**  
* **Simplicity versus scale: start with a modular backend, durable queue, and relational storage; introduce specialized analytics infrastructure only when measured workload justifies it.**  
* **Convenience versus safety: short links obscure destinations, making abuse reporting and administrative blocking part of the core product rather than optional polish.**

