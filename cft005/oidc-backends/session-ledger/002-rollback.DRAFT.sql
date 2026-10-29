-- Retire a FUTURE HML candidate only after stopping coordinator/A/B, draining
-- pools and expiring all old cookies; NEVER reactivate the memory-only backend
-- with existing credentials/sessions. Epoch removal is not a security rollback.
-- No CASCADE, record DML, user removal, or automatic role/dependency deletion.
BEGIN;
DO $guard$
BEGIN
  IF current_database()<>'cft005_hml_db_teste'
    OR current_setting('cft005.reviewed_session_retirement',true) IS DISTINCT FROM 'CFT005-HML-LEDGER-1-stopped-and-drained'
  THEN RAISE EXCEPTION 'E_HML_LEDGER_RETIREMENT_REQUIRED'; END IF;
END $guard$;
-- Keep epochs/nonces/sessions durable for review. Withdraw only runtime access.
REVOKE ALL ON cft005_hml_auth.epochs,cft005_hml_auth.sessions FROM cft005_hml_a,cft005_hml_b;
REVOKE UPDATE(lock_pad) ON cft005_hml_auth.epochs,cft005_hml_auth.sessions FROM cft005_hml_a,cft005_hml_b;
REVOKE USAGE ON SCHEMA cft005_hml_auth FROM cft005_hml_a,cft005_hml_b;
ALTER ROLE cft005_hml_coordinator NOLOGIN;
COMMIT;
