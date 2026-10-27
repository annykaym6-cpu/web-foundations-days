# Day 8 Reflection

## What was the most difficult concept in the course, and how did you overcome it?

The most difficult concept for me was caching, because it makes reads much faster but the cached data can become stale. At first I did not understand when the cache should be cleared. I overcame it by following one request through the QuickNotes design step by step: a cache hit returns in about 1 ms, a cache miss goes to the database, and every write deletes the cached notes. Drawing the arrows myself and writing out the GET and POST flows made it clear. Now I can explain the trade-off between speed and freshness in my own words.

## Which part of your capstone would you improve, based on the feedback you received?

Based on the feedback I received, I would improve how I explain my architecture diagram. The audience's wish was that I show more clearly what happens at each step, for example by showing the request in the browser's Network tab when I create a note. Next time I would practise a shorter explanation, point to each component in order, and add one live example so the demo and the design connect.

## What will you learn next?

Next I want to build a real backend with Node.js and Express and connect it to a PostgreSQL database, so my QuickNotes API design becomes working code. My first small step will be creating a server with two endpoints, GET /notes and POST /notes.
