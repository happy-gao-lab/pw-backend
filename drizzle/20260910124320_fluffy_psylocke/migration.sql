CREATE TABLE "definitions" (
	"id" serial PRIMARY KEY,
	"word_id" integer NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY,
	"word_id" integer NOT NULL,
	"value" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" serial PRIMARY KEY,
	"value" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_word_definitions" (
	"id" serial PRIMARY KEY,
	"user_word_id" integer NOT NULL,
	"definition_id" integer NOT NULL,
	CONSTRAINT "user_word_definitions_unique" UNIQUE("user_word_id","definition_id")
);
--> statement-breakpoint
CREATE TABLE "user_word_translations" (
	"id" serial PRIMARY KEY,
	"user_word_id" integer NOT NULL,
	"translation_id" integer NOT NULL,
	CONSTRAINT "user_word_translations_unique" UNIQUE("user_word_id","translation_id")
);
--> statement-breakpoint
CREATE TABLE "user_words" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"word_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_words_unique" UNIQUE("user_id","word_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "definitions_value_lower_unique" ON "definitions" ("word_id",lower("value"));--> statement-breakpoint
CREATE UNIQUE INDEX "translations_value_lower_unique" ON "translations" ("word_id",lower("value"));--> statement-breakpoint
CREATE UNIQUE INDEX "words_value_lower_unique" ON "words" (lower("value"));--> statement-breakpoint
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_word_id_words_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_word_id_words_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_word_definitions" ADD CONSTRAINT "user_word_definitions_user_word_id_user_words_id_fkey" FOREIGN KEY ("user_word_id") REFERENCES "user_words"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_word_definitions" ADD CONSTRAINT "user_word_definitions_definition_id_definitions_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_word_translations" ADD CONSTRAINT "user_word_translations_user_word_id_user_words_id_fkey" FOREIGN KEY ("user_word_id") REFERENCES "user_words"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_word_translations" ADD CONSTRAINT "user_word_translations_translation_id_translations_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "translations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_words" ADD CONSTRAINT "user_words_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_words" ADD CONSTRAINT "user_words_word_id_words_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE;