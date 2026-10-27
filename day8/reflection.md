# Day 8 Reflection

## What was the most difficult concept in the course, and how did you overcome it?

The most difficult concept for me was caching, because it makes reads much faster but the cached data can become stale. At first I did not understand when the cache should be cleared. I overcame it by following one request through the QuickNotes design step by step: a cache hit returns in about 1 ms, a cache miss goes to the database, and every write deletes the cached notes. Drawing the arrows myself and writing out the GET and POST flows made it clear.

## Which part of your capstone would you improve, based on the feedback you received?

I would improve how precisely I follow the brief and explain my choices. My Project 2 feedback (96/100) asked me to add a composite index on the notes table for user_id and created_at descending in docs/data-model.md, and to explain how it speeds up the paginated note list. My Project 1 feedback (92/100) pointed out that I used the id form-message instead of the required error-message, which automated tests would miss. I will use the exact names from a brief and give a reason for every index.

## What will you learn next?

Next I want to build a real backend with Node.js and Express and connect it to a PostgreSQL database, so my QuickNotes API design becomes working code. My first small step will be creating a server with two endpoints, GET /notes and POST /notes.
