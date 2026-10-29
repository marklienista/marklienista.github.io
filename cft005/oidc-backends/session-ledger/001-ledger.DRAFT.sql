-- PREPARATION ONLY. Never executed by startup. No credentials or record DML.
-- Requires a separately reviewed administrative window and explicit transaction-local guard.
BEGIN;
SET LOCAL lock_timeout = '1500ms';
SET LOCAL statement_timeout = '5000ms';
DO $guard$
BEGIN
  IF current_database()<>'cft005_hml_db_teste'
    OR current_setting('cft005.reviewed_session_ledger',true) IS DISTINCT FROM 'CFT005-HML-LEDGER-1'
    OR to_regclass('cft005_hml_a.records') IS NULL
    OR to_regclass('cft005_hml_b.records') IS NULL
    OR to_regnamespace('cft005_hml_auth') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('cft005_hml_session_owner','cft005_hml_coordinator'))
  THEN RAISE EXCEPTION 'E_HML_LEDGER_REVIEW_REQUIRED'; END IF;
END $guard$;

CREATE ROLE cft005_hml_session_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
CREATE ROLE cft005_hml_coordinator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 2;
-- Administrative ownership only; never grant this membership to runtime A/B/coordinator.
GRANT cft005_hml_session_owner TO CURRENT_USER;
CREATE SCHEMA cft005_hml_auth AUTHORIZATION cft005_hml_session_owner;
SET LOCAL ROLE cft005_hml_session_owner;
REVOKE ALL ON SCHEMA cft005_hml_auth FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA cft005_hml_auth REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE cft005_hml_auth.epochs(
  owner_label text PRIMARY KEY CHECK(owner_label IN ('U1','U2')),
  epoch bigint NOT NULL DEFAULT 1 CHECK(epoch BETWEEN 1 AND 9007199254740991),
  lock_pad boolean NOT NULL DEFAULT false CHECK(lock_pad=false)
);
INSERT INTO cft005_hml_auth.epochs(owner_label) VALUES('U1'),('U2');
CREATE TABLE cft005_hml_auth.sessions(
  session_hash text PRIMARY KEY CHECK(session_hash ~ '^[a-f0-9]{64}$'),
  product text NOT NULL CHECK(product IN ('A','B')),
  owner_label text NOT NULL REFERENCES cft005_hml_auth.epochs(owner_label),
  epoch bigint NOT NULL CHECK(epoch BETWEEN 1 AND 9007199254740991),
  issued_at bigint NOT NULL,
  expires_at bigint NOT NULL CHECK(expires_at>issued_at AND expires_at<=issued_at+900),
  revoked boolean NOT NULL DEFAULT false,
  lock_pad boolean NOT NULL DEFAULT false CHECK(lock_pad=false)
);
CREATE INDEX sessions_owner_product ON cft005_hml_auth.sessions(owner_label,product);
CREATE TABLE cft005_hml_auth.nonces(
  issuer text NOT NULL CHECK(issuer IN ('A','B')),
  nonce text NOT NULL CHECK(nonce ~ '^[a-f0-9]{64}$'),
  expires_at bigint NOT NULL,
  PRIMARY KEY(issuer,nonce)
);

ALTER TABLE cft005_hml_auth.epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_auth.epochs FORCE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_auth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_auth.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_auth.nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE cft005_hml_auth.nonces FORCE ROW LEVEL SECURITY;
CREATE POLICY coordinator_epochs ON cft005_hml_auth.epochs TO cft005_hml_coordinator USING(true) WITH CHECK(true);
CREATE POLICY coordinator_sessions ON cft005_hml_auth.sessions TO cft005_hml_coordinator USING(true) WITH CHECK(true);
CREATE POLICY coordinator_nonces ON cft005_hml_auth.nonces TO cft005_hml_coordinator USING(true) WITH CHECK(true);
CREATE POLICY runtime_epoch_read ON cft005_hml_auth.epochs FOR SELECT TO cft005_hml_a,cft005_hml_b
  USING(owner_label=current_setting('cft005.owner',true));
CREATE POLICY runtime_epoch_lock ON cft005_hml_auth.epochs FOR UPDATE TO cft005_hml_a,cft005_hml_b
  USING(owner_label=current_setting('cft005.owner',true)) WITH CHECK(owner_label=current_setting('cft005.owner',true));
CREATE POLICY runtime_session_read ON cft005_hml_auth.sessions FOR SELECT TO cft005_hml_a,cft005_hml_b
  USING(owner_label=current_setting('cft005.owner',true) AND product=CASE current_user WHEN 'cft005_hml_a' THEN 'A' WHEN 'cft005_hml_b' THEN 'B' END);
CREATE POLICY runtime_session_lock ON cft005_hml_auth.sessions FOR UPDATE TO cft005_hml_a,cft005_hml_b
  USING(owner_label=current_setting('cft005.owner',true) AND product=CASE current_user WHEN 'cft005_hml_a' THEN 'A' WHEN 'cft005_hml_b' THEN 'B' END)
  WITH CHECK(owner_label=current_setting('cft005.owner',true) AND product=CASE current_user WHEN 'cft005_hml_a' THEN 'A' WHEN 'cft005_hml_b' THEN 'B' END);

GRANT USAGE ON SCHEMA cft005_hml_auth TO cft005_hml_a,cft005_hml_b,cft005_hml_coordinator;
GRANT SELECT ON cft005_hml_auth.epochs,cft005_hml_auth.sessions TO cft005_hml_a,cft005_hml_b;
-- PostgreSQL row locks require UPDATE on at least one column. Only an immutable
-- false padding column is granted; epoch/revoked/binding/expiry remain forbidden.
GRANT UPDATE(lock_pad) ON cft005_hml_auth.epochs,cft005_hml_auth.sessions TO cft005_hml_a,cft005_hml_b;
GRANT SELECT ON cft005_hml_auth.epochs,cft005_hml_auth.sessions,cft005_hml_auth.nonces TO cft005_hml_coordinator;
GRANT INSERT ON cft005_hml_auth.sessions,cft005_hml_auth.nonces TO cft005_hml_coordinator;
GRANT UPDATE(epoch) ON cft005_hml_auth.epochs TO cft005_hml_coordinator;
GRANT UPDATE(revoked) ON cft005_hml_auth.sessions TO cft005_hml_coordinator;
-- No data-schema grants, functions, SECURITY DEFINER, views, triggers or publications.
RESET ROLE;
COMMIT;
