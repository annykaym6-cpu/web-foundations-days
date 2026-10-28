# TicketHub Design

## 1. Requirements
**Functional:** browse events, view seat map, hold seats (5 min), pay, view my tickets, release a hold.
**Non-functional:** *Correctness:* a seat is never sold twice; no charge without a ticket. *Speed:* pages under 300 ms, holds under 500 ms. *Fairness:* waiting room, limits per account and IP, max 6 tickets per order. *Availability:* 99.9%, and it must survive the on-sale spike.

## 2. Estimates (1 day = 100,000 s, peak = 5x)
**Normal day:** 50,000 x 10 pages = 500,000/day = 5 views/s (25 peak). 5,000 tickets/day = 0.05/s (0.25 peak).
**Big sale:** 200,000 users x 20 requests = 4M in 600 s = 6,700 req/s (20,000 in the first minute). 200,000 x 3 hold attempts / 600 s = 1,000 holds/s (3,000 at the start). 20,000 seats = at most 33 tickets/s. 10 people per seat.
**Comparison:** 270 to 800 times more requests, 130 times more tickets/s, and thousands of conflicting writes on the same rows. One server handles a normal day; the sale needs a plan.

## 3. API
| Endpoint | Purpose | OK |
|---|---|---|
| GET /events | browse events | 200 |
| GET /events/{id}/seats | seat map | 200 |
| POST /events/{id}/holds `{"seat_ids":[1,2]}` | hold seats | 201 |
| POST /orders `{"hold_id":5,"payment_token":"tok"}` + Idempotency-Key | pay | 201 |
| GET /me/tickets | my tickets | 200 |
| DELETE /holds/{id} | release hold | 204 |

Errors: 400, 401, 404, 409 seat taken, 410 hold expired, 429, 503.

## 4. Data model
```sql
users   (id PK, email UNIQUE, name)
events  (id PK, name, starts_at, on_sale_at)
holds   (id PK, user_id FK, event_id FK, expires_at)
seats   (id PK, event_id FK, label, price_cents,
         status CHECK IN ('available','held','sold'), hold_id FK, held_until)
orders  (id PK, user_id FK, hold_id FK UNIQUE, status, idempotency_key)
tickets (id PK, order_id FK, seat_id FK UNIQUE, user_id FK)
```
User 1-many holds and orders; event 1-many seats; hold 1-many seats; order 1-many tickets; seat 1-at most one ticket.

## 5. Preventing double-booking
Check and change happen in one atomic statement inside a transaction:
```sql
BEGIN;
INSERT INTO holds(user_id,event_id,expires_at) VALUES (:u,:e,now()+interval '5 min') RETURNING id;
UPDATE seats SET status='held', hold_id=:h, held_until=now()+interval '5 min'
 WHERE id = ANY(:ids) AND (status='available' OR held_until < now());
-- updated rows <> seats requested: ROLLBACK and return 409
COMMIT;
```
If two requests hit one seat, the second waits on the row lock, re-checks the WHERE, finds it held, updates 0 rows and gets 409. Paying runs a second transaction: `UPDATE seats SET status='sold' WHERE hold_id=:h AND held_until>now()`, then INSERT tickets, all or nothing. Safety net: `tickets.seat_id` is UNIQUE, so the database refuses a second ticket. Holds and purchases use the primary DB only; cache and replicas are for display.

## 6. Architecture
```
Browser -> DNS
Browser -> CDN (static files, event pages)
Browser -> Load balancer -> Waiting room (Redis) -> App servers xN
App servers -> Redis cache | Primary DB -> Read replica | Queue -> Workers | Payment provider
```
- **DNS:** finds our servers. **CDN:** serves static content near users, so crowds never hit our servers.
- **Load balancer:** spreads traffic, drops dead servers, rate-limits.
- **Waiting room:** admits about 2,000 buyers at a time, in fair order.
- **App servers:** stateless, so we add more before the sale.
- **Redis:** caches the seat map for 1 to 2 s.
- **Primary DB:** the only place holds and purchases are decided. **Replica:** serves browsing and backup.
- **Queue + workers:** send emails and free expired holds. **Payment provider:** takes cards, so we store none.

**Surviving the sale:** the time is known, so we scale out first; the waiting room caps load at about 1,000 req/s; most reads come from CDN and cache; only short indexed updates hit the primary.

## 7. Trade-offs
1. **Correctness vs speed:** every hold goes to the primary, which is slower than a cache, but selling a seat twice is worse. The waiting room protects the primary.
2. **Fresh seat map vs load:** a 1 to 2 s old map is cheap for 200,000 viewers, but users sometimes click a taken seat and get 409.
3. **Fairness vs convenience:** the waiting room makes people wait, but without it the site crashes and bots win.

Full detail: `ticketing-design-detailed.md`
