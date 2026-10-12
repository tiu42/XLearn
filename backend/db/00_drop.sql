-- =============================================================================
-- XLearn LMS - Xóa toàn bộ schema (CHỈ DÙNG Ở MÔI TRƯỜNG DEV/TEST)
-- Thứ tự: bảng con trước, bảng cha sau -> không cần CASCADE (cú pháp riêng của PG)
-- =============================================================================
DROP VIEW  IF EXISTS v_enrollment_progress;
DROP TABLE IF EXISTS quiz_attempt_text_answers;
DROP TABLE IF EXISTS quiz_attempt_answers;
DROP TABLE IF EXISTS quiz_attempts;
DROP TABLE IF EXISTS lesson_progress;
DROP TABLE IF EXISTS enrollments;
DROP TABLE IF EXISTS quiz_options;
DROP TABLE IF EXISTS quiz_questions;
DROP TABLE IF EXISTS quizzes;
DROP TABLE IF EXISTS lesson_files;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS course_sections;
DROP TABLE IF EXISTS course_instructors;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS storage_objects;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS departments;
