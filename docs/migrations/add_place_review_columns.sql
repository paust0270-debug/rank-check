-- slot_rank_place_history에 방문자/블로그 리뷰수 컬럼 추가
-- Supabase SQL Editor 또는 run-migration.bat에서 실행

ALTER TABLE slot_rank_place_history ADD COLUMN IF NOT EXISTS visitor_review_count integer;
ALTER TABLE slot_rank_place_history ADD COLUMN IF NOT EXISTS blog_review_count integer;
