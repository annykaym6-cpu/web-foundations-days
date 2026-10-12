-- Day 6 assignment: A School Database
-- Works in MySQL Workbench (MySQL 8) and in SQLite playgrounds.
-- Run the whole file from top to bottom.

-- ============ 1. Tables ============

CREATE TABLE students (
  id          INT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(100) NOT NULL UNIQUE,  -- no two students share an email
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courses (
  id      INT PRIMARY KEY,
  code    VARCHAR(20) NOT NULL UNIQUE,       -- e.g. WEB101
  title   VARCHAR(100) NOT NULL,
  credits INT NOT NULL CHECK (credits > 0)
);

-- Join table: one row = one student enrolled on one course
CREATE TABLE enrolments (
  student_id  INT NOT NULL,
  course_id   INT NOT NULL,
  grade       INT CHECK (grade BETWEEN 0 AND 100),  -- empty until marked
  enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, course_id),       -- same student cannot join the same course twice
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

-- ============ 2. Sample data ============

INSERT INTO students (id, name, email) VALUES
  (1, 'Amina Otieno',   'amina@example.com'),
  (2, 'Brian Kamau',    'brian@example.com'),
  (3, 'Cynthia Mwangi', 'cynthia@example.com'),
  (4, 'David Ouma',     'david@example.com');   -- David has no enrolments yet

INSERT INTO courses (id, code, title, credits) VALUES
  (1, 'WEB101', 'Web Foundations',   3),
  (2, 'DB201',  'Databases',         4),
  (3, 'JS150',  'JavaScript Basics', 3);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 78),
  (2, 1, 64),
  (2, 3, NULL),
  (3, 1, 92),
  (3, 2, NULL);

-- ============ 3. Queries ============

-- Query 1: all courses for one student (by name)
SELECT courses.code, courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses    ON courses.id = enrolments.course_id
WHERE students.name = 'Amina Otieno';

-- Query 2: all students on one course
SELECT students.name, students.email, enrolments.grade
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students   ON students.id = enrolments.student_id
WHERE courses.code = 'WEB101';

-- Query 3: number of students per course (courses with zero students still appear)
SELECT courses.code, courses.title, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id;

-- Query 4: students who have no enrolments
SELECT students.name, students.email
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.student_id IS NULL;

-- Query 5: update one enrolment's grade (Brian's grade on JS150), then check it
UPDATE enrolments
SET grade = 71
WHERE student_id = 2   -- Brian Kamau
  AND course_id  = 3;  -- JS150

SELECT students.name, courses.code, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses  ON courses.id  = enrolments.course_id
WHERE students.name = 'Brian Kamau';