UPDATE "competitions"
SET "gender_eligibility" = 'MALE_ONLY'
WHERE "is_default" = true
  AND "slug" IN ('bodybuilding', 'mens-physique');

