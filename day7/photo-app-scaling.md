# SnapShare Scaling Plan

SnapShare is a photo-sharing app. Users upload photos and scroll a feed of
photos from the people they follow. This plan estimates the load and designs
an architecture that can handle it.

## 1. Assumptions

- 10,000,000 registered users.
- 10% are active on a given day, so there are **1,000,000 daily active users
  (DAU)**.
- Each active user uploads **1 photo per day**.
- Each active user views **50 feed pages per day**.
- An average photo is **2 MB**, and each photo also gets a **50 KB thumbnail**.
- One day is about **100,000 seconds** (rounded to make the maths easy).
- Peak traffic is about **5 times** the average.

## 2. Estimates

### Uploads per second (writes)

```text
1,000,000 users x 1 photo      = 1,000,000 uploads per day
1,000,000 / 100,000 seconds    = 10 uploads per second (average)
Peak: 10 x 5                   = 50 uploads per second
```

### Feed views per second (reads)

```text
1,000,000 users x 50 pages     = 50,000,000 feed views per day
50,000,000 / 100,000 seconds   = 500 feed views per second (average)
Peak: 500 x 5                  = 2,500 feed views per second
```

### Storage per year

```text
Photos:      1,000,000 x 2 MB   = 2 TB per day
             2 TB x 365         = 730 TB per year
Thumbnails:  1,000,000 x 50 KB  = 50 GB per day
             50 GB x 365        = about 18 TB per year
Total                           = about 750 TB per year (roughly 0.75 PB)
```

The database only holds small metadata rows (photo id, owner, file location,
caption, time), which is well under 1 GB per day. The 750 TB is the photo
files themselves.

### Upload bandwidth

10 uploads per second x 2 MB = about 20 MB per second on average, and about
100 MB per second at peak.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**: 500 feed views per second against 10 uploads per
second is about **50 reads for every write**.

What this means for the design:

- Caching is very valuable, because the same feeds and photos are viewed again
  and again.
- A CDN should serve the photo and thumbnail files, so most of the traffic
  never reaches our servers.
- Read replicas of the database take the read load off the primary.
- Writes are rare enough that a single primary database can handle them (50 per
  second at peak).
- The heavy part of an upload (making thumbnails) can happen in the background.

## 4. Why photos are not stored in the database

Photos are large files. At about 750 TB per year they would make the database
enormous, slow to back up, slow to copy to replicas, and very expensive,
because database storage costs far more per GB than file storage. Databases
are built for small structured rows that are searched and joined, not for
streaming large files to users.

Instead, the photo files go into **object storage** (such as Amazon S3). It is
cheap, almost unlimited, very durable, and works well with a CDN. The database
stores only the **metadata** and a **link or key** to each file, for example
`photos/2026/10/abc123.jpg` and `thumbs/2026/10/abc123.jpg`.

## 5. Architecture diagram

```text
                       +-----------+
        +------------> |    DNS    |  (snapshare.com -> addresses)
        |              +-----------+
 +------+--------+  static files, photos, thumbnails  +--------------------+
 |   Browser /   | ---------------------------------> | CDN (edge servers) |
 | mobile client |                                    +---------+----------+
 +------+--------+                                              | (cache miss only)
        |                                                       v
        | API calls (HTTPS, JSON)                    +--------------------+
        v                                            |   OBJECT STORAGE   |
 +---------------+                                   | originals+thumbs   |
 | Load balancer |                                   +----^----------^----+
 +-------+-------+                                        |          |
   +-----+------+-----------+                             |          |
   v            v           v                             |          |
+-------+   +-------+   +-------+     +-----------------+ |          |
| App 1 |   | App 2 |   | App 3 | --> | Cache (Redis)   | |          |
+---+---+   +---+---+   +---+---+     | feeds, sessions | |          |
    |           |           |         +-----------------+ |          |
    |  writes   |  reads    |  save original photo        |          |
    |           |           +-----------------------------+          |
    v           v                                                    |
+----------+  +----------+      +-------+      +--------+            |
| Primary  |->| Read     |      | Queue | ---> | Worker | -----------+
| database |  | replica  |      +---^---+      +---+----+  saves thumbnail
+----------+  +----------+          |              |
                                    |              +--> updates the photo row
          App servers add a         |                   in the primary database
          "make thumbnail" job -----+
```

Route of the main requests:

- **Loading the page:** browser -> DNS -> CDN (HTML, CSS, JS).
- **Viewing the feed (GET /feed):** browser -> load balancer -> app server ->
  cache (on a miss -> read replica). The browser then fetches each thumbnail
  or photo from the CDN, which gets it from object storage on a miss.
- **Uploading (POST /photos):** browser -> load balancer -> app server ->
  object storage + primary database + queue -> worker (see section 7).

Rough sizing: at about 500 requests per second per app server, peak load of
2,500 feed views per second needs about 5 app servers, so 6 gives some spare
capacity. With 80 to 90 percent of feeds served from the cache, the read
replica sees only a few hundred queries per second.

## 6. What each component does

- **DNS:** turns the name snapshare.com into the address of our servers, so users do not need to know IP addresses.
- **CDN:** keeps copies of static files, photos and thumbnails on edge servers near users, which lowers latency and takes huge load off our own servers.
- **Load balancer:** spreads requests across several app servers and skips any that fail a health check, so no single server is overloaded and one crash does not stop the app.
- **App servers:** run the API code (checking login, reading feeds, handling uploads); there are several and they are stateless, so we can add more as traffic grows.
- **Cache (Redis):** keeps recently used feeds and sessions in fast memory, so repeated reads do not hit the database.
- **Primary database:** the one true copy of the metadata (users, follows, photos, captions) and the only place that accepts writes.
- **Read replica:** a copy of the primary that answers read queries, which spreads the heavy read load and can take over if the primary fails.
- **Object storage:** stores the large photo and thumbnail files cheaply, durably and at almost unlimited size, which keeps them out of the database.
- **Message queue:** holds "make a thumbnail" jobs, so the upload can finish quickly and busy periods just make the queue longer instead of overloading the system.
- **Worker:** takes jobs from the queue and does the slow work (making the 50 KB thumbnail) in the background.

## 7. Upload flow, step by step

1. The user picks a photo and the app sends `POST /photos` with the image and a login token.
2. The request reaches the **load balancer**, which forwards it to a healthy **app server**.
3. The app server checks the token, then validates the file (it must be an allowed image type and under the size limit).
4. The app server saves the **original photo** into **object storage** and gets back its key, for example `photos/2026/10/abc123.jpg`.
5. The app server writes a new row to the **primary database** with the owner, key, caption, time and a status of "processing".
6. The app server adds a **"make thumbnail for abc123" job** to the **queue**.
7. The app server replies to the user straight away with `201 Created`. The user does not wait for the thumbnail.
8. A **worker** takes the job from the queue, downloads the original from object storage, and creates a 50 KB thumbnail.
9. The worker saves the thumbnail into object storage (`thumbs/2026/10/abc123.jpg`) and updates the database row with the thumbnail key and a status of "ready".
10. If the worker fails, the job stays in the queue (or is retried with a growing wait), so the thumbnail is still made later and nothing is lost.
11. Followers see the new photo the next time their cached feed expires or is refreshed. Their browsers load the thumbnail from the CDN.

## 8. Trade-offs

1. **Speed versus freshness (caching).** Feeds are cached in Redis for a short
   time, for example 60 seconds. This makes feeds very fast and protects the
   database. The cost is that a follower may not see a new photo for up to a
   minute. Clearing the cached feeds of every follower on each upload would
   be far too much work, so a short expiry is a better choice. A slightly old
   feed is acceptable for a photo app (it would not be for a bank balance).

2. **Fast upload versus instant thumbnail (queue).** Making thumbnails in the
   background keeps uploads quick and protects the servers during busy
   periods. The cost is more moving parts (a queue and workers), and the
   thumbnail may not exist for a second or two, so the app shows a placeholder
   until the status becomes "ready".

3. **Cost versus reliability.** Running several app servers, a read replica
   and a CDN costs more than one server. In return there is no single point of
   failure, and the app stays up if a server or the primary database fails.
   For a new app with few users, one server would be cheaper and simpler;
   this design is chosen because of the expected load of 1 million daily users.

4. **Consistency versus availability (replica lag).** The replica copies data
   from the primary a few milliseconds later. A user could upload a photo and
   not see it in their own feed for a moment. We accept this to keep reads
   fast and available, and could read the user's own newest photos from the
   primary if it mattered.

5. **Simplicity versus scalability.** One well-organised application (a
   monolith) is simpler to build and run than many microservices. We keep a
   monolith for now and would only split parts out, for example image
   processing, if there is a clear reason.
