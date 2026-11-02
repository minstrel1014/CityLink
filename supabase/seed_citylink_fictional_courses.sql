-- FICTIONAL CITYLINK DEMONSTRATION CATALOGUE — NOT VERIFIED CITYU COURSES.
-- Proposed seed only. Review before use; this file has not been run against Supabase.
-- Safe to rerun: the existing unique (code, semester) constraint skips duplicates.
-- Existing rows with the same code/semester are left unchanged; unrelated rows are untouched.
-- `id`, `description`, and `created_at` use their schema defaults.

begin;

insert into public.courses (
  code,
  title,
  department,
  credits,
  semester,
  color
)
values
  ('COMP101', 'Introduction to Programming', 'Computer Science', 3.0, '2026-Fall', 'sage'),
  ('COMP203', 'Data Structures and Algorithms', 'Computer Science', 3.0, '2026-Fall', 'peach'),
  ('COMP215', 'Web Application Development', 'Computer Science', 3.0, '2026-Fall', 'lavender'),
  ('DATA201', 'Introduction to Data Analytics', 'Data Science', 3.0, '2026-Fall', 'blue'),
  ('DATA310', 'Applied Machine Learning', 'Data Science', 3.0, '2026-Fall', 'yellow'),
  ('BUS101', 'Foundations of Business', 'Business', 3.0, '2026-Fall', 'sage'),
  ('BUS220', 'Marketing Principles', 'Business', 3.0, '2026-Fall', 'peach'),
  ('FIN201', 'Introduction to Finance', 'Finance', 3.0, '2026-Fall', 'lavender'),
  ('MATH120', 'Statistics for University Students', 'Mathematics', 3.0, '2026-Fall', 'blue'),
  ('COMM105', 'Communication and Presentation Skills', 'Communication', 2.0, '2026-Fall', 'yellow')
on conflict (code, semester) do nothing;

commit;
