ALTER TABLE "sessions" ADD COLUMN "transcription_source" TEXT;

ALTER TABLE "scores" ADD COLUMN "is_mock" BOOLEAN NOT NULL DEFAULT false;
