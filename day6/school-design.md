# School Database Design

This database stores the students at a school, the courses they can take, and
which student is enrolled on which course (with a grade). The SQL is in
`school.sql`.

## The tables

### students
One row per student.

- `id`: primary key, a unique number for each student.
- `name`: the student's name (`NOT NULL`).
- `email`: the student's email (`NOT NULL` and `UNIQUE`, so two students cannot
  share one).
- `created_at`: filled in automatically when the row is added.

### courses
One row per course.

- `id`: primary key.
- `code`: a short unique code such as `WEB101` (`UNIQUE`).
- `title`: the course name.
- `credits`: how many credits the course is worth (must be above 0).

### enrolments
One row for each time a student is enrolled on a course.

- `student_id`: foreign key pointing to `students.id`.
- `course_id`: foreign key pointing to `courses.id`.
- `grade`: the mark from 0 to 100. It can be empty until the work is marked.
- `enrolled_at`: filled in automatically.
- The primary key is the pair `(student_id, course_id)`. This stops the same
  student being enrolled on the same course twice.

Both foreign keys use `ON DELETE CASCADE`, so deleting a student or a course
also removes their enrolment rows and leaves no broken links.

## Relationships

- **One-to-many:** one student has many enrolments, and one course has many
  enrolments. Each enrolment row belongs to exactly one student and one
  course.
- **Many-to-many:** students and courses. A student can take many courses, and
  a course has many students.

A join table is needed because a single column cannot hold "many" values
cleanly. Putting a list of courses inside a student row (such as
`"WEB101,DB201"`) would be hard to search and update, and putting a list of
students inside a course row would have the same problem. The `enrolments`
table stores one pair of ids per row instead. It is also the natural place for
facts about the pair itself, such as the grade, because a grade belongs to
"this student on this course", not to the student or the course alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

The primary key `(student_id, course_id)` already makes it fast to look up a
student's courses. Queries that start from a course ("all students on
WEB101", or the number of students per course) filter by `course_id`, and
without an index the database would have to scan every enrolment row. The
index lets it jump straight to the matching rows. The cost is that inserts
become slightly slower and the index uses a little extra space, which is a
good trade for a read-heavy table.

## SQL or NoSQL?

I would choose SQL (a relational database such as MySQL or PostgreSQL). The
data is clearly structured, with students, courses and enrolments that always
have the same fields, and it is full of relationships, especially the
many-to-many link between students and courses. SQL handles that well with
foreign keys and JOINs, and it can enforce rules in the database itself, such
as unique emails, no duplicate enrolments, and grades between 0 and 100.
Correctness matters for school records, and transactions mean related changes
succeed or fail together. A document database such as MongoDB could store each
student with their courses inside one document, but then course details would
be duplicated across many students and queries like "all students on one
course" would be harder. NoSQL would only become attractive if the data became
very flexible or grew to an enormous scale.
