CREATE TABLE "tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(44) NOT NULL,
	"symbol" varchar(50),
	"name" varchar(100),
	"decimals" integer,
	"logo_url" varchar(255),
	"coingecko_id" varchar(100),
	"last_price" numeric(20, 6),
	"last_updated" timestamp DEFAULT now(),
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"metadata" json,
	CONSTRAINT "tokens_address_unique" UNIQUE("address")
);
--> statement-breakpoint
ALTER TABLE "pnl_records" ADD COLUMN "last_trade_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_address_idx" ON "tokens" USING btree ("address");--> statement-breakpoint
CREATE INDEX "tokens_symbol_idx" ON "tokens" USING btree ("symbol");--> statement-breakpoint
ALTER TABLE "pnl_records" ADD CONSTRAINT "pnl_records_last_trade_id_trades_id_fk" FOREIGN KEY ("last_trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pnl_records_last_trade_idx" ON "pnl_records" USING btree ("last_trade_id");