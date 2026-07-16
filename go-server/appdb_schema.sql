-- Schema for OmniDB's own app database (connections, groups, snippets,
-- users, ...) — a byte-for-byte match of the tables the original Django
-- app's migrations created (OmniDB_app/migrations/0001_3_0_0.py plus the
-- Technology.sqlite row added in 0003_3_1_0.py), trimmed to exactly the
-- tables go-server actually reads or writes (see appdb_bootstrap.go's
-- comment for how that list was derived). Deliberately excludes Django's
-- own bookkeeping tables (auth_group*, auth_permission, django_session,
-- django_migrations, django_admin_log, django_content_type,
-- social_auth_*, OmniDB_app_config) — go-server never uses Django's ORM,
-- session framework, permission system, or the plugin/social-auth
-- machinery this migration deliberately dropped, so seeding tables for
-- them would be dead weight with nothing to ever read them back.

CREATE TABLE IF NOT EXISTS "auth_user" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"password" varchar(128) NOT NULL,
	"last_login" datetime NULL,
	"is_superuser" bool NOT NULL,
	"username" varchar(150) NOT NULL UNIQUE,
	"last_name" varchar(150) NOT NULL,
	"email" varchar(254) NOT NULL,
	"is_staff" bool NOT NULL,
	"is_active" bool NOT NULL,
	"date_joined" datetime NOT NULL,
	"first_name" varchar(150) NOT NULL
);

CREATE TABLE IF NOT EXISTS "OmniDB_app_technology" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"name" varchar(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS "OmniDB_app_connection" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"alias" varchar(200) NOT NULL,
	"conn_string" text NOT NULL,
	"database" varchar(200) NOT NULL,
	"password" varchar(200) NOT NULL,
	"port" varchar(50) NOT NULL,
	"server" varchar(200) NOT NULL,
	"ssh_key" text NOT NULL,
	"ssh_password" varchar(200) NOT NULL,
	"ssh_port" varchar(50) NOT NULL,
	"ssh_server" varchar(200) NOT NULL,
	"ssh_user" varchar(200) NOT NULL,
	"use_tunnel" bool NOT NULL,
	"technology_id" integer NOT NULL REFERENCES "OmniDB_app_technology" ("id") DEFERRABLE INITIALLY DEFERRED,
	"username" varchar(200) NOT NULL,
	"public" bool NOT NULL
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_connection_user_id_423a02be" ON "OmniDB_app_connection" ("user_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_connection_technology_id_65db623e" ON "OmniDB_app_connection" ("technology_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_group" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"name" varchar(50) NOT NULL,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_group_user_id_54dc9e1f" ON "OmniDB_app_group" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_groupconnection" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"connection_id" bigint NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"group_id" bigint NOT NULL REFERENCES "OmniDB_app_group" ("id") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "unique_group_connection" UNIQUE ("group_id", "connection_id")
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_groupconnection_connection_id_cccce15b" ON "OmniDB_app_groupconnection" ("connection_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_groupconnection_group_id_11a76c3e" ON "OmniDB_app_groupconnection" ("group_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_snippetfolder" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"name" varchar(200) NOT NULL,
	"create_date" datetime NOT NULL,
	"modify_date" datetime NOT NULL,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"parent_id" bigint NULL REFERENCES "OmniDB_app_snippetfolder" ("id") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_snippetfolder_user_id_9d186f5d" ON "OmniDB_app_snippetfolder" ("user_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_snippetfolder_parent_id_e5f797d6" ON "OmniDB_app_snippetfolder" ("parent_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_snippetfile" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"name" varchar(200) NOT NULL,
	"create_date" datetime NOT NULL,
	"modify_date" datetime NOT NULL,
	"text" text NOT NULL,
	"parent_id" integer NULL REFERENCES "OmniDB_app_snippetfolder" ("id") DEFERRABLE INITIALLY DEFERRED,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_snippetfile_parent_id_7f8ca95a" ON "OmniDB_app_snippetfile" ("parent_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_snippetfile_user_id_4f4fb78e" ON "OmniDB_app_snippetfile" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_tab" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"title" varchar(200) NOT NULL,
	"snippet" text NOT NULL,
	"connection_id" bigint NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"last_used" text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_tab_connection_id_c664a283" ON "OmniDB_app_tab" ("connection_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_tab_user_id_c1492bdc" ON "OmniDB_app_tab" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_consolehistory" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"snippet" text NOT NULL,
	"connection_id" bigint NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"start_time" datetime NOT NULL
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_consolehistory_connection_id_f23b7a70" ON "OmniDB_app_consolehistory" ("connection_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_consolehistory_user_id_f73eea80" ON "OmniDB_app_consolehistory" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_queryhistory" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"start_time" datetime NOT NULL,
	"end_time" datetime NOT NULL,
	"duration" text NOT NULL,
	"status" text NOT NULL,
	"connection_id" bigint NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"snippet" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_queryhistory_connection_id_e5b1d75b" ON "OmniDB_app_queryhistory" ("connection_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_queryhistory_user_id_47e015ec" ON "OmniDB_app_queryhistory" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_shortcut" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"code" varchar(200) NOT NULL,
	"ctrl_pressed" bool NOT NULL,
	"shift_pressed" bool NOT NULL,
	"alt_pressed" bool NOT NULL,
	"meta_pressed" bool NOT NULL,
	"key" varchar(200) NOT NULL,
	"user_id" integer NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED,
	"os" varchar(200) NOT NULL
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_shortcut_user_id_f3d1af58" ON "OmniDB_app_shortcut" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_monunits" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"script_chart" text NOT NULL,
	"script_data" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"is_default" bool NOT NULL,
	"interval" integer NOT NULL,
	"technology_id" integer NOT NULL REFERENCES "OmniDB_app_technology" ("id") DEFERRABLE INITIALLY DEFERRED,
	"user_id" integer NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_monunits_technology_id_95fca855" ON "OmniDB_app_monunits" ("technology_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_monunits_user_id_098d59df" ON "OmniDB_app_monunits" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_monunitsconnections" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"interval" integer NOT NULL,
	"plugin_name" text NOT NULL,
	"connection_id" bigint NOT NULL REFERENCES "OmniDB_app_connection" ("id") DEFERRABLE INITIALLY DEFERRED,
	"unit" integer NOT NULL,
	"user_id" integer NOT NULL REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS "OmniDB_app_monunitsconnections_connection_id_f67cb3f0" ON "OmniDB_app_monunitsconnections" ("connection_id");
CREATE INDEX IF NOT EXISTS "OmniDB_app_monunitsconnections_user_id_2c3aa020" ON "OmniDB_app_monunitsconnections" ("user_id");

CREATE TABLE IF NOT EXISTS "OmniDB_app_userdetails" (
	"id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
	"theme" varchar(50) NOT NULL,
	"font_size" integer NOT NULL,
	"csv_encoding" varchar(50) NOT NULL,
	"csv_delimiter" varchar(10) NOT NULL,
	"welcome_closed" bool NOT NULL,
	"indent_unit" varchar(20) NOT NULL DEFAULT '    ',
	"comma_style" varchar(10) NOT NULL DEFAULT 'leading',
	"keyword_case" varchar(10) NOT NULL DEFAULT 'preserve',
	"user_id" integer NOT NULL UNIQUE REFERENCES "auth_user" ("id") DEFERRABLE INITIALLY DEFERRED
);
