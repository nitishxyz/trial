CREATE TABLE "pnl_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pnl_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"wallet_address" varchar(44) NOT NULL,
	"date" timestamp NOT NULL,
	"start_balance" numeric(20, 9) NOT NULL,
	"end_balance" numeric(20, 9),
	"realized_pnl" numeric(20, 6) NOT NULL,
	"unrealized_pnl" numeric(20, 6),
	"total_trades" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stream_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stream_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"platform" varchar(50) NOT NULL,
	"stream_url" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true,
	"last_heartbeat" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_positions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "token_positions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"wallet_address" varchar(44) NOT NULL,
	"token_mint" varchar(44) NOT NULL,
	"amount" numeric(20, 9) NOT NULL,
	"average_entry_price" numeric(20, 6) NOT NULL,
	"current_price" numeric(20, 6),
	"unrealized_pnl" numeric(20, 6),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"signature" varchar(88) NOT NULL,
	"wallet_address" varchar(44) NOT NULL,
	"token_a" varchar(44) NOT NULL,
	"token_b" varchar(44) NOT NULL,
	"type" varchar(10) NOT NULL,
	"amount_a" numeric(20, 9) NOT NULL,
	"amount_b" numeric(20, 9) NOT NULL,
	"price_usd" numeric(20, 6) NOT NULL,
	"trade_pnl" numeric(20, 6),
	"platform" varchar(50) NOT NULL,
	"tx_fees" numeric(10, 9) NOT NULL,
	"timestamp" timestamp NOT NULL,
	"raw_data" json,
	CONSTRAINT "trades_signature_unique" UNIQUE("signature")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"display_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"wallet_address" varchar(44) NOT NULL,
	"stream_platform" varchar(50),
	"stream_url" varchar(255),
	"is_live" boolean DEFAULT false,
	"last_active" timestamp,
	"is_admin" boolean DEFAULT false,
	"avatar_url" varchar(255),
	"twitter_handle" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
ALTER TABLE "pnl_records" ADD CONSTRAINT "pnl_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_sessions" ADD CONSTRAINT "stream_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_positions" ADD CONSTRAINT "token_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pnl_records_user_id_idx" ON "pnl_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pnl_records_wallet_date_idx" ON "pnl_records" USING btree ("wallet_address","date");--> statement-breakpoint
CREATE INDEX "stream_sessions_user_id_idx" ON "stream_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_sessions_is_active_idx" ON "stream_sessions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "stream_sessions_platform_idx" ON "stream_sessions" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "token_positions_user_id_idx" ON "token_positions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "token_positions_wallet_token_idx" ON "token_positions" USING btree ("wallet_address","token_mint");--> statement-breakpoint
CREATE INDEX "token_positions_updated_at_idx" ON "token_positions" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_signature_idx" ON "trades" USING btree ("signature");--> statement-breakpoint
CREATE INDEX "trades_user_id_idx" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_wallet_address_idx" ON "trades" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "trades_timestamp_idx" ON "trades" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "trades_tokens_idx" ON "trades" USING btree ("token_a","token_b");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_wallet_address_idx" ON "users" USING btree ("wallet_address");--> statement-breakpoint
CREATE INDEX "users_stream_platform_idx" ON "users" USING btree ("stream_platform");--> statement-breakpoint
CREATE INDEX "users_is_live_idx" ON "users" USING btree ("is_live");