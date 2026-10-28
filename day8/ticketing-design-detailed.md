# Design Document: TicketHub, an Event Ticketing System

## 0. Context, goals and non-goals

**Context.** TicketHub is a website that sells tickets for concerts and events. Most days it is quiet. A few times a month a very popular concert goes on sale and far more people arrive than there are seats. The hard part of the design is not the quiet days. It is the first ten minutes of a big sale, when the system must stay up, be fair, and **never sell the same seat twice**.

**Goals**
- Let users browse events, see which seats are free, hold seats, pay and see their tickets.
- Survive a big on-sale (200,000 people, 20,000 seats, 10 minutes) without crashing and without double-booking.
- Keep the sale fair, so that fast scripts and bots do not beat ordinary people.

**Non-goals** (deliberately left out to keep the design small)
- Resale or ticket transfer between users.
- Multiple countries, currencies and tax rules.
- Recommendations, reviews and a mobile app (the API is designed so a mobile app could use it later).
- Building our own payment system: a payment provider handles card details.

**Starting facts used in this document**

| Fact | Value |
|------|-------|
| Registered users | 2,000,000 |
| Normal day | 50,000 visitors, each viewing 10 pages; 5,000 tickets sold |
| Big sale | 200,000 people try to buy 20,000 seats in the first 10 minutes |

---

## 1. Requirements

### Functional requirements (what the system must do)

1. Users can register, log in and log out.
2. Users can browse and search events (by name, city and date) and open an event page.
3. Users can see the seat map of an event with each seat's status: available, held or sold.
4. Users can **hold** one or more seats for a short time (5 minutes) while they pay.
5. Users can pay for held seats; on success they receive tickets (with a unique code) by email and in "My tickets".
6. Users can release a hold, and holds that expire free their seats automatically.
7. Users can see their past orders and tickets.
8. Staff can create events, set the on-sale time and prices, and define the seats.

### Non-functional requirements (how well it must do it)

| Quality | Requirement |
|---------|-------------|
| **Correctness** | A seat is **never sold to two people**. A user is **never charged without getting tickets** (or an automatic refund). This outranks every other requirement. |
| **Speed** | Event pages and seat map load in under 300 ms for 95% of requests; placing a hold answers in under 500 ms, even during a big sale. |
| **Fairness** | During a big sale, buyers are admitted in a fair order (not "whoever has the fastest script"); one account gets one place in line; limits per account and per IP address; a maximum of 6 tickets per order. |
| **Availability** | 99.9% overall; during an on-sale window the system must not fall over, and it is better to make users wait than to fail. |
| **Scalability** | Handle a spike of over 100 times normal load that arrives within seconds, at a time we know in advance. |
| **Security and privacy** | HTTPS only, hashed passwords, card details never stored on our servers (the payment provider returns a token), input validated on the server. |
| **Durability** | A paid order is never lost: it is stored on the primary database and replicated, with backups. |
| **Observability** | Logs, metrics and alerts (error rate, latency, queue length, hold conflicts, payment failures), with a live dashboard during sales. |

---

## 2. Estimates

Rounding rules: 1 day is about 100,000 seconds; peak on a normal day is 5 times the average.

### Normal day

```
Page views:   50,000 visitors x 10 pages  = 500,000 per day
              500,000 / 100,000           = 5 page views per second (average)
              peak: 5 x 5                 = 25 page views per second

Tickets sold: 5,000 per day
              5,000 / 100,000             = 0.05 tickets per second (one sale every 20 s)
              peak: 5 x 0.05              = 0.25 tickets per second (one every 4 s)

Storage:      5,000 tickets/day x about 300 bytes (ticket + order rows)
              = 1.5 MB per day, about 550 MB per year
```

A normal day is tiny: one ordinary server and a database could handle it. The system is read-heavy (pages versus purchases is about 100 to 1) and storage is not a concern at all.

### The big sale

Assumptions: 200,000 people arrive within the first 10 minutes (600 seconds). Each person makes about 20 requests during that time (opening the event, refreshing the seat map, picking seats and retrying). Each person makes about 3 hold attempts, because the first choices are often taken. The first minute is about 3 times busier than the 10-minute average.

```
Requests:     200,000 users x 20 requests = 4,000,000 requests in 600 s
              4,000,000 / 600             = about 6,700 requests per second (average)
              first-minute spike: 3 x     = about 20,000 requests per second

Hold attempts: 200,000 users x 3 attempts = 600,000 in 600 s
              600,000 / 600               = about 1,000 hold attempts per second
              first-minute spike: 3 x     = about 3,000 hold attempts per second

Seats sold:   20,000 seats in 600 s       = about 33 tickets per second (at most)
              (if the average order is 2 tickets: about 17 payments per second)

Competition:  200,000 people / 20,000 seats = 10 people for every seat
              so at least 9 out of 10 people will not get a ticket
```

### Comparison

| Measure | Normal day (peak) | Big sale | Increase |
|---------|-------------------|----------|----------|
| Requests per second | 25 | 6,700 average, 20,000 at the start | about 270 to 800 times |
| Tickets sold per second | 0.25 | up to 33 | about 130 times |
| Writes that can conflict (hold attempts per second) | almost 0 | 1,000 to 3,000 | thousands of times |
| People per seat | far fewer than 1 | 10 | extreme competition |

**What the numbers tell us**

1. The big sale is not slightly harder, it is a **different problem**. The normal day needs one server; the sale needs more than 100 times as much capacity for ten minutes.
2. It is a **spike we know about in advance** (the on-sale time is published), so we can prepare: add servers, warm the caches and open the waiting room beforehand.
3. The danger is not storage or purchases per second. It is thousands of people **competing for the same 20,000 rows** at the same moment. Whatever protects against double-booking must also be fast.
4. Because 90% of people will fail, how we treat them (a fair queue, a clear "sold out" message) matters as much as how we treat the winners.

---

## 3. API

Base URL `https://api.tickethub.com/v1`. JSON everywhere. Every endpoint except browsing needs `Authorization: Bearer <token>`. Servers are stateless: the token carries the identity.

| # | Method and path | Purpose | Success |
|---|-----------------|---------|---------|
| 1 | `GET /events` | Browse and search events (`?city=&date=&q=&limit=&offset=`) | `200 OK` |
| 2 | `GET /events/{id}` | One event: name, venue, date, on-sale time, price range | `200 OK` |
| 3 | `GET /events/{id}/seats` | Seat map with each seat's status (may be a second or two old) | `200 OK` |
| 4 | `POST /events/{id}/queue` | Join the waiting room for a big sale | `202 Accepted` |
| 5 | `GET /queue/{queueId}` | Check position; when admitted, returns a short-lived `admission_token` | `200 OK` |
| 6 | `POST /events/{id}/holds` | Hold seats for 5 minutes | `201 Created` |
| 7 | `DELETE /holds/{holdId}` | Release a hold early | `204 No Content` |
| 8 | `POST /orders` | Pay for a hold (needs an `Idempotency-Key` header) | `201 Created` |
| 9 | `GET /orders/{id}` | One order and its status | `200 OK` |
| 10 | `GET /me/tickets` | The current user's tickets | `200 OK` |
| 11 | `POST /auth/register`, `POST /auth/login` | Create account / get a token | `201` / `200` |

### Key examples

**Hold seats**: `POST /events/42/holds` (during a big sale the header `X-Admission-Token` is also required)

```json
{ "seat_ids": [8801, 8802] }
```

Response `201 Created`:

```json
{
  "hold_id": 5103,
  "event_id": 42,
  "seat_ids": [8801, 8802],
  "expires_at": "2026-11-02T18:05:00Z",
  "total_cents": 24000
}
```

If any requested seat is no longer available, nothing is held (all or nothing) and the response is `409 Conflict`:

```json
{ "error": { "code": "SEAT_TAKEN", "message": "One or more seats were just taken. Please choose different seats.", "unavailable_seat_ids": [8802] } }
```

**Pay**: `POST /orders` with header `Idempotency-Key: 7b2f...` (a unique value the client creates once per purchase attempt):

```json
{ "hold_id": 5103, "payment_token": "tok_abc123" }
```

Response `201 Created`:

```json
{
  "order_id": 9120,
  "status": "paid",
  "tickets": [
    { "ticket_id": 7701, "seat_id": 8801, "code": "TH-9F3K-22QX" },
    { "ticket_id": 7702, "seat_id": 8802, "code": "TH-9F3K-22QY" }
  ]
}
```

### Error codes

| Status | When | Example `error.code` |
|--------|------|----------------------|
| `400` | Bad input (for example more than 6 seats) | `VALIDATION_ERROR` |
| `401` | Missing or expired token | `UNAUTHENTICATED` |
| `402` | The payment was declined | `PAYMENT_FAILED` |
| `403` | Not allowed (for example no admission token during a big sale) | `FORBIDDEN` |
| `404` | Event, hold or order not found | `NOT_FOUND` |
| `409` | A seat was taken by someone else | `SEAT_TAKEN` |
| `410` | The hold expired before payment | `HOLD_EXPIRED` |
| `429` | Too many requests (rate limit); includes `Retry-After` | `RATE_LIMITED` |
| `503` | Overloaded or a dependency is down; retry later | `UNAVAILABLE` |

**Why `Idempotency-Key`?** If a user's phone loses signal after pressing "Pay", the app will retry. The server remembers the key, so the retry returns the original order instead of charging a second time.

---

## 4. Data model

### Tables and relationships

```
 users 1 ───< holds >─── 1 events 1 ───< seats
   │                        │              │ (status, hold_id, held_until)
   │ 1                      │              │ 1
   └──< orders >────────────┘              │
          │ 1                              │
          └──< tickets >───────────────────┘   tickets.seat_id is UNIQUE
```

- **One-to-many:** a user has many holds, orders and tickets; an event has many seats and many orders; an order has many tickets; a hold covers many seats.
- **One-to-one:** a hold becomes at most one order (`orders.hold_id` is unique), and a seat has at most one ticket (`tickets.seat_id` is unique).
- **Many-to-many:** users and events are linked through orders and tickets (a user attends many events, an event has many attendees).

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Accounts | `id` PK, `email` unique, `password_hash`, `name` |
| `events` | Concerts and shows | `id` PK, `name`, `venue`, `city`, `starts_at`, `on_sale_at`, `status` |
| `seats` | Every seat of every event; **the row that is contested** | `id` PK, `event_id` FK, `section`, `row_label`, `seat_number`, `price_cents`, `status`, `hold_id` FK, `held_until` |
| `holds` | A temporary reservation of seats by one user | `id` PK, `user_id` FK, `event_id` FK, `expires_at`, `status` |
| `orders` | A purchase attempt and its payment | `id` PK, `user_id` FK, `event_id` FK, `hold_id` FK unique, `total_cents`, `status`, `payment_ref`, `idempotency_key` |
| `tickets` | One issued ticket per sold seat | `id` PK, `order_id` FK, `seat_id` FK **unique**, `user_id` FK, `code` unique |

### CREATE TABLE statements (PostgreSQL)

```sql
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    venue      VARCHAR(200) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    starts_at  TIMESTAMPTZ  NOT NULL,
    on_sale_at TIMESTAMPTZ  NOT NULL,
    status     VARCHAR(12)  NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'on_sale', 'sold_out', 'cancelled', 'finished'))
);

CREATE TABLE holds (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id),
    event_id   BIGINT      NOT NULL REFERENCES events (id),
    expires_at TIMESTAMPTZ NOT NULL,
    status     VARCHAR(10) NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'completed', 'released', 'expired'))
);

CREATE TABLE seats (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id    BIGINT      NOT NULL REFERENCES events (id),
    section     VARCHAR(20) NOT NULL,
    row_label   VARCHAR(10) NOT NULL,
    seat_number INT         NOT NULL,
    price_cents INT         NOT NULL CHECK (price_cents >= 0),
    status      VARCHAR(10) NOT NULL DEFAULT 'available'
                CHECK (status IN ('available', 'held', 'sold')),
    hold_id     BIGINT      REFERENCES holds (id),
    held_until  TIMESTAMPTZ,
    UNIQUE (event_id, section, row_label, seat_number),          -- no duplicate seat definitions
    CHECK (status <> 'held' OR (hold_id IS NOT NULL AND held_until IS NOT NULL))
);

CREATE TABLE orders (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users (id),
    event_id        BIGINT       NOT NULL REFERENCES events (id),
    hold_id         BIGINT       NOT NULL UNIQUE REFERENCES holds (id),  -- one order per hold
    total_cents     INT          NOT NULL CHECK (total_cents >= 0),
    status          VARCHAR(10)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_ref     VARCHAR(100),
    idempotency_key VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)                                  -- a retry cannot create a second order
);

CREATE TABLE tickets (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id  BIGINT      NOT NULL REFERENCES orders (id),
    seat_id   BIGINT      NOT NULL UNIQUE REFERENCES seats (id),       -- THE LAST LINE OF DEFENCE
    user_id   BIGINT      NOT NULL REFERENCES users (id),
    code      VARCHAR(40) NOT NULL UNIQUE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Indexes

```sql
CREATE INDEX idx_seats_event_status ON seats (event_id, status);           -- seat map and "how many left"
CREATE INDEX idx_seats_hold         ON seats (hold_id);                    -- find the seats of a hold
CREATE INDEX idx_holds_expiring     ON holds (expires_at) WHERE status = 'active';  -- the expiry sweeper
CREATE INDEX idx_tickets_user       ON tickets (user_id);                  -- "My tickets"
CREATE INDEX idx_orders_user        ON orders (user_id, created_at DESC);  -- order history
```

**Why SQL (PostgreSQL)?** Ticketing is exactly the case where we need transactions and constraints: the seat, the hold, the order and the ticket must change together or not at all, and the database must be able to refuse a double sale. A document database would give up much of that safety.

---

## 5. How the design prevents two people from buying the same seat

Double-booking happens when two requests both read "seat 8801 is available" and then both write "sold". The fix is to never separate the **check** from the **change**. The design has several layers, and **only the database is trusted**.

### Layer 1: an atomic conditional update (the main guard)

Placing a hold is one SQL statement that checks and changes the seat in the same step, inside a transaction:

```sql
BEGIN;

INSERT INTO holds (user_id, event_id, expires_at)
VALUES (:user, :event, now() + interval '5 minutes')
RETURNING id;                                   -- :hold

UPDATE seats
SET    status = 'held', hold_id = :hold, held_until = now() + interval '5 minutes'
WHERE  event_id = :event
  AND  id = ANY(:seat_ids)
  AND  (status = 'available'
        OR (status = 'held' AND held_until < now()));   -- an expired hold counts as free

-- If the number of rows updated is NOT equal to the number of seats requested,
-- somebody else got one first: ROLLBACK and answer 409 Conflict.
-- Otherwise:
COMMIT;
```

Why this is safe: when two requests update the same seat row at the same moment, the database makes the second one **wait** for the first to finish (a row lock). When it continues, it checks the `WHERE` condition again against the new, committed data. The seat is now `held`, the condition is false, zero rows are updated, and that request gets `409 Conflict`. Exactly one request wins, and there is no "check then write" gap for a second request to slip through. Because the update is all-or-nothing, a user never ends up holding only some of the seats they asked for.

### Layer 2: payment only for a still-valid hold

Buying uses a second guarded transaction that runs **after** the payment succeeds:

```sql
BEGIN;

UPDATE seats
SET    status = 'sold'
WHERE  hold_id = :hold
  AND  status = 'held'
  AND  held_until > now();                      -- must still be our valid hold

-- Rows updated must equal the number of seats in the hold, else ROLLBACK
-- (the hold expired: refund the payment automatically and answer 410 Gone).

INSERT INTO tickets (order_id, seat_id, user_id, code)
SELECT :order, id, :user, generate_ticket_code()
FROM   seats WHERE hold_id = :hold;

UPDATE orders SET status = 'paid' WHERE id = :order;
UPDATE holds  SET status = 'completed' WHERE id = :hold;

COMMIT;
```

To stop a hold expiring while the user is typing card details, starting the payment extends the hold by two more minutes (once). If it still expires before the money is taken, the system refunds automatically, so the user is never charged without tickets.

### Layer 3: a unique constraint (the safety net)

`tickets.seat_id` is `UNIQUE`. Even if there were a bug in the code above, the database would refuse to create a second ticket for the same seat and the whole transaction would roll back. The correct behaviour is guaranteed by the database itself and not only by our code. Likewise `orders (user_id, idempotency_key)` is unique, so a retried payment cannot create two orders.

### Layer 4: things that deliberately do **not** decide

- **The cache and CDN** show a seat map that may be a second or two old, so a user can click a seat that was just taken. That is fine: the click leads to the hold in Layer 1, which answers `409 Conflict` and the page refreshes. The cache is for display, never for deciding.
- **Read replicas** are never used to check availability for a hold, because they can lag behind the primary. All holds and purchases go to the **primary** database.
- **The waiting room** reduces how many people compete at once, but is a fairness and load tool, not a safety guarantee.

### Cleaning up abandoned holds

If a user abandons a hold, the seat must return to the pool. Two mechanisms work together: (1) the `WHERE` clause in Layer 1 treats a seat whose `held_until` is in the past as available, so correctness never depends on a cleanup job; (2) a background worker runs every few seconds and marks expired holds (`idx_holds_expiring`) as `expired`, freeing their seats so the seat map is accurate.

---

## 6. Architecture

```
                         ┌─────────┐
          ┌─────────────>│   DNS   │  tickethub.com → IP addresses
          │              └─────────┘
 ┌────────┴──────┐  event pages, images, JS, CSS    ┌──────────────────────┐
 │ Browser /     │ ───────────────────────────────> │ CDN (edge servers)   │
 │ mobile app    │                                  └──────────────────────┘
 └────────┬──────┘
          │ API calls (HTTPS)
          v
 ┌─────────────────────────────┐
 │ Load balancer               │  rate limiting, bot checks, health checks
 └──────────────┬──────────────┘
                v
 ┌─────────────────────────────┐        ┌──────────────────────────────┐
 │ Waiting room                │ <────> │ Redis                        │
 │ (big sales only: admits     │        │  - cache: event pages, seat  │
 │  users a batch at a time)   │        │    map (1 to 2 s old)        │
 └──────────────┬──────────────┘        │  - waiting-room queue        │
                │ admitted users        │  - rate-limit counters       │
        ┌───────┴───────┬───────────┐   └──────────────────────────────┘
        v               v           v                 ^
    ┌───────┐       ┌───────┐   ┌───────┐             │
    │ App 1 │       │ App 2 │...│ App N │ ────────────┘
    └───┬───┘       └───┬───┘   └───┬───┘   (stateless; N grows before a sale)
        │ holds, orders │ browsing  │ jobs
        v               v           v
 ┌──────────────┐ ┌──────────────┐ ┌─────────────┐    ┌──────────────────────┐
 │ PRIMARY DB   │>│ Read replica │ │ Message     │──> │ Workers              │
 │ (all holds   │ │ (event pages │ │ queue       │    │ - send ticket emails │
 │ and orders)  │ │ and history) │ └─────────────┘    │ - expire old holds   │
 └──────────────┘ └──────────────┘                    │ - process payment    │
                                                      │   confirmations      │
                                                      └──────────────────────┘
                    App servers <──────────> Payment provider (external; tokens only)
```

**Load estimate (corner note):** normal day 5 pages/s (25 at peak), 0.25 tickets/s at peak. Big sale about 6,700 requests/s (20,000 at the start), up to 3,000 hold attempts/s, 33 tickets/s, 10 people per seat.

### What each component does

- **DNS:** turns `tickethub.com` into the addresses of our CDN and load balancer, so users can find the site.
- **CDN:** serves images, JavaScript, CSS and the (cached) event pages from servers near the user, so the huge crowd of browsers never reaches our own servers for static content.
- **Load balancer:** spreads requests over the app servers, removes unhealthy servers, and applies rate limits and basic bot protection so one client cannot overload the system.
- **Waiting room (with Redis):** during a big sale, it lets people in a batch at a time (for example 2,000 active shoppers), so 200,000 arrivals cannot all hit the database at the same moment, and it decides the order fairly.
- **App servers (stateless):** run the API logic (browse, hold, pay); because they keep nothing in memory about users, we can add as many as the sale needs and lose any of them without losing data.
- **Redis cache:** keeps event pages and the seat map in memory with a 1 to 2 second expiry, so thousands of people looking at the same seat map cause one database read, not thousands.
- **Primary database (PostgreSQL):** the one source of truth; all holds and purchases go here so that the atomic updates and unique constraints in section 5 can guarantee no double-booking.
- **Read replica:** serves browsing and "My tickets" queries so those reads do not slow down the primary, and can be promoted to primary if the primary fails.
- **Message queue and workers:** take slow jobs (ticket emails, PDF tickets, sweeping expired holds, handling payment confirmations) out of the request, so users get a fast answer and work waits in line instead of overloading the system.
- **Payment provider (external):** handles card numbers and charging, so we never store card details and can use a specialist service; we send an idempotency key so a retry never charges twice.

### How it survives the big sale

1. **We know when it happens.** The on-sale time is published, so we **scale out in advance**: more app servers, a pre-warmed cache, and extra capacity at the CDN and load balancer. The servers are stateless, so this is just adding copies.
2. **The waiting room turns a stampede into a steady stream.** Without it, up to 20,000 requests per second would hit the app servers and about 3,000 hold attempts per second would hit the primary database. With roughly 2,000 admitted shoppers at a time, the load the core system sees is bounded and predictable (about 1,000 requests per second), however large the crowd outside.
3. **Fairness.** People who arrive before the on-sale time are placed in a **random order**, and those who arrive after join in arrival order, so speed of clicking is not an advantage. One queue place per account, rate limits per account and IP, bot challenges, and a maximum of 6 tickets per order reduce scalping.
4. **Most reads never reach the database.** The seat map and event pages come from the CDN and Redis (a 1 to 2 second cache). Only holds and purchases touch the primary, and each is a short indexed update.
5. **Contention is limited to the seats.** Only requests for the same seat row wait for each other, and each wait is milliseconds. Hold attempts of about 1,000 to 3,000 per second are well within what one PostgreSQL primary does for simple indexed updates.
6. **Slow work is moved out of the request.** Emails and PDF generation go to the queue; a backlog of emails never slows buying.
7. **Graceful degradation.** If the system gets close to its limits, it switches off non-essential features (recommendations, search suggestions) and lets the waiting room admit fewer people. It is better for users to wait than to see errors.
8. **Failures are survived.** A crashed app server is removed by the health check and requests are retried on another; a payment timeout is retried safely because of the idempotency key; expired holds free seats automatically; if Redis fails, the app falls back to reading the database (slower, but correct).
9. **Practice.** Before important sales, we run a load test at more than the expected 200,000 users and watch the dashboard (error rate, latency, queue length, hold conflicts) during the real sale, with alerts.

### Avoiding single points of failure

| Component | How its failure is survived |
|-----------|-----------------------------|
| App servers | Many identical, stateless servers behind the load balancer |
| Load balancer | Managed cloud load balancer or an active/standby pair |
| Primary database | Replica ready to be promoted (failover) plus regular backups |
| Redis | Standby node; the app falls back to the database if the cache is lost |
| Queue and workers | Jobs stay in the queue until a worker confirms them; several workers |
| Payment provider | Timeouts and safe retries; if it is down, buyers keep their hold a little longer and see a clear message |

---

## 7. Trade-offs

1. **Correctness versus speed (always ask the primary database).** Every hold and purchase is checked on the single primary database, which is slower and less scalable than answering from a cache or a replica. We accept this because selling a seat twice is the worst possible failure. The price is that the primary is the bottleneck in a sale, which is why the waiting room limits how much reaches it.
2. **Fresh seat map versus load.** The seat map is cached for 1 to 2 seconds. This makes it cheap to show to 200,000 people, but a user will sometimes click a seat that was just taken and get a `409`. We accept that small annoyance (the page refreshes and suggests other seats) in exchange for a database that does not collapse.
3. **Fairness and protection versus convenience.** The waiting room makes people wait, and a random order for early arrivals means that the fastest person does not always win. Some users will be frustrated, but without it the site would crash for everyone, and bots would take most of the tickets.
4. **Hold length: 5 minutes.** A longer hold gives buyers time to pay, but seats stay locked by people who never finish, which hides seats from others during the most competitive minutes. A shorter hold frees seats faster but frustrates slow typists. Five minutes, with a single 2-minute extension while a payment is in progress, is a balance.
5. **Simplicity versus scalability (one primary database).** One database is much simpler to run than a sharded one, and the load estimate shows it is enough. If TicketHub grew to many simultaneous big events, we would **shard by `event_id`**, because all seats of one event are contested together while different events never compete. The cost is more complex operations.
6. **Consistency over availability when parts fail.** If the primary database is unreachable, the system stops accepting holds and purchases (and shows a clear message) instead of guessing. Browsing keeps working from cache and replicas.

### Alternatives considered

- **Locking seats in Redis instead of the database.** Redis is very fast, but it would then be a second place to record who owns a seat, and keeping it consistent with the database after crashes is hard. Using the database alone keeps one source of truth.
- **`SELECT ... FOR UPDATE` (lock the row first, then update).** This also works, but it holds locks longer and needs more round trips. The single conditional `UPDATE` is shorter and does the same job.
- **Optimistic version numbers on each seat.** Also safe, but it needs a retry loop in the application. The conditional update is simpler.
- **Sell without holds ("first successful payment wins").** Simple, but users would pay and then be told the seat was gone, which means many refunds and angry customers.
- **A document database (NoSQL).** It scales writes more easily, but it gives weaker transactions and constraints, which are the core of what this system needs.

### Risks and open questions

- **Bots and resellers are a constant race.** The waiting room and rate limits help, but need ongoing tuning (identity checks, limits per payment card).
- **Payment provider outages.** If it is slow during a sale, holds may expire; we need a clear policy (extend holds, or refund automatically).
- **Refunds and cancelled events:** the data model needs a rule for returning a seat to the pool (it is not covered here, because of the `UNIQUE` ticket constraint it must void the old ticket first).
- **Capacity numbers are assumptions** (20 requests per user, 3 hold attempts per user). They must be checked with a real load test before a major sale.
