CREATE TYPE "provider" AS ENUM('local', 'google');--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"provider" "provider" NOT NULL,
	"provider_user_id" varchar(255),
	"password_hash" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_provider_user_id_unique" UNIQUE("provider","provider_user_id"),
	CONSTRAINT "auth_identities_user_id_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"email" varchar(255) NOT NULL UNIQUE,
	"username" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deletion_date" timestamp,
	"token_version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;