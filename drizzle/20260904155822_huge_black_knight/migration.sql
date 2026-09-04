CREATE TABLE "definitions" (
	"id" serial PRIMARY KEY,
	"word_id" integer NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "definition_unique" UNIQUE("word_id","value")
);
--> statement-breakpoint
CREATE TABLE "dictionary" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"word_id" integer NOT NULL,
	"definition_id" integer NOT NULL,
	"translation_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_unique" UNIQUE("user_id","word_id","definition_id","translation_id")
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY,
	"word_id" integer NOT NULL,
	"value" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translations_unique" UNIQUE("word_id","value")
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" serial PRIMARY KEY,
	"value" varchar(255) NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "definitions" ADD CONSTRAINT "definitions_word_id_words_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dictionary" ADD CONSTRAINT "dictionary_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dictionary" ADD CONSTRAINT "dictionary_word_id_words_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dictionary" ADD CONSTRAINT "dictionary_definition_id_definitions_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "definitions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "dictionary" ADD CONSTRAINT "dictionary_translation_id_translations_id_fkey" FOREIGN KEY ("translation_id") REFERENCES "translations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_word_id_words_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE;