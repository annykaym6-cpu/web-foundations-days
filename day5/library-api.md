# Library API Design

A REST API for a library's **books** resource. The resource is a plural noun
(`/books`), each book is addressed by its id (`/books/{id}`), and the HTTP
method says what to do.

## The book object

```json
{
  "id": 7,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "year": 1958,
  "available": true
}
```

## Endpoints

### 1. List all books

- **Method and path:** `GET /books`
- **Description:** Returns an array of every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book

- **Method and path:** `GET /books/{id}`
- **Description:** Returns the single book with the given id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book

- **Method and path:** `POST /books`
- **Description:** Adds a new book to the library; the server assigns the id.
- **Example request body:**

```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "isbn": "9780385474542",
    "year": 1958
  }
```

- **Success status:** `201 Created` (the response contains the new book with its id)

### 4. Replace a book

- **Method and path:** `PUT /books/{id}`
- **Description:** Replaces the whole book record with the data sent.
- **Example request body:**

```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "isbn": "9780385474542",
    "year": 1958,
    "available": true
  }
```

- **Success status:** `200 OK`

### 5. Update part of a book

- **Method and path:** `PATCH /books/{id}`
- **Description:** Changes only the fields sent, such as marking a book as borrowed.
- **Example request body:**

```json
  { "available": false }
```

- **Success status:** `200 OK`

### 6. Delete a book

- **Method and path:** `DELETE /books/{id}`
- **Description:** Removes the book from the library.
- **Request body:** none
- **Success status:** `204 No Content`

### 7. List books by an author

- **Method and path:** `GET /books?author=Chinua%20Achebe`
- **Description:** Returns only the books whose author matches the `author` query parameter.
- **Request body:** none
- **Success status:** `200 OK` (an empty array `[]` if the author has no books)

## Error codes

### 400 Bad Request

The request is invalid, so the server cannot process it.

- **Example:** `POST /books` with an empty title, such as `{ "title": "", "author": "Chinua Achebe" }`.
- **Example:** `PATCH /books/7` with `{ "year": "nineteen fifty" }`, because `year` must be a number.

### 404 Not Found

The book or the URL does not exist.

- **Example:** `GET /books/9999` when no book has id 9999.
- **Example:** `DELETE /books/9999` for a book that was already deleted.
