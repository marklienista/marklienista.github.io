-- Fresh LOCAL cluster only: synthetic copy of the required two-product boundary.
-- No import, connection string or data from Render/Auth0/published applications.
CREATE ROLE cft005_hml_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
CREATE ROLE cft005_hml_a NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2;
CREATE ROLE cft005_hml_b NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2;
REVOKE ALL ON DATABASE cft005_hml_db_teste FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE cft005_hml_db_teste TO cft005_hml_a,cft005_hml_b;
GRANT cft005_hml_owner TO CURRENT_USER;
CREATE SCHEMA cft005_hml_a AUTHORIZATION cft005_hml_owner;
CREATE SCHEMA cft005_hml_b AUTHORIZATION cft005_hml_owner;
SET ROLE cft005_hml_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE cft005_hml_a.records(
  record_id text PRIMARY KEY CHECK(record_id='HML-A-'||owner_label),
  owner_label text NOT NULL CHECK(owner_label IN ('U1','U2')),
  product text NOT NULL CHECK(product='A'),value text NOT NULL,revision integer NOT NULL DEFAULT 4
);
CREATE TABLE cft005_hml_b.records(
  record_id text PRIMARY KEY CHECK(record_id='HML-B-'||owner_label),
  owner_label text NOT NULL CHECK(owner_label IN ('U1','U2')),
  product text NOT NULL CHECK(product='B'),value text NOT NULL,revision integer NOT NULL DEFAULT 4
);
INSERT INTO cft005_hml_a.records VALUES('HML-A-U1','U1','A','synthetic-proof-U1-A',4),('HML-A-U2','U2','A','synthetic-proof-U2-A',4);
INSERT INTO cft005_hml_b.records VALUES('HML-B-U1','U1','B','synthetic-proof-U1-B',4),('HML-B-U2','U2','B','synthetic-proof-U2-B',4);
ALTER TABLE cft005_hml_a.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_a.records FORCE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_b.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_b.records FORCE ROW LEVEL SECURITY;
CREATE POLICY own_record ON cft005_hml_a.records TO cft005_hml_a USING(owner_label=current_setting('cft005.owner',true)) WITH CHECK(owner_label=current_setting('cft005.owner',true));
CREATE POLICY own_record ON cft005_hml_b.records TO cft005_hml_b USING(owner_label=current_setting('cft005.owner',true)) WITH CHECK(owner_label=current_setting('cft005.owner',true));
GRANT USAGE ON SCHEMA cft005_hml_a TO cft005_hml_a;
GRANT USAGE ON SCHEMA cft005_hml_b TO cft005_hml_b;
GRANT SELECT,INSERT,UPDATE ON cft005_hml_a.records TO cft005_hml_a;
GRANT SELECT,INSERT,UPDATE ON cft005_hml_b.records TO cft005_hml_b;
RESET ROLE;
