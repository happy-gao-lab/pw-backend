ALTER TABLE "users" RENAME COLUMN "age" TO "passwordHash";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "passwordHash" SET DATA TYPE varchar(255) USING "passwordHash"::varchar(255);