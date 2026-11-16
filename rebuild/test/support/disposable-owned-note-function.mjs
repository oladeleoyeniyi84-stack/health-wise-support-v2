/**
 * Disposable-only SQL factory. NOT a production migration.
 * Schema names are generated locally by the isolated test, never from HTTP.
 * SECURITY DEFINER must be tightly scoped with a fixed search_path.
 */
const VALID_SCHEMA=/^hw_[a-z0-9_]{5,56}$/;
export function disposableOwnedNoteRoutineSql(schema){
 if(typeof schema!=="string" || !VALID_SCHEMA.test(schema))
   throw new Error("disposable_schema_required");
 const qualified='"'+schema+'"';
 return `CREATE FUNCTION ${qualified}.vault_write_owned_note(
 p_session text,p_record text,p_note text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $vault$
DECLARE v_subject text;
BEGIN
 IF p_session IS NULL OR p_record IS NULL OR p_note IS NULL
    OR length(p_note)>500 THEN RETURN false; END IF;

 SELECT subject_id INTO v_subject
 FROM ${qualified}.vault_sessions
 WHERE session_id=p_session AND revoked=false AND expires_at>CURRENT_TIMESTAMP
 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;

 PERFORM 1 FROM ${qualified}.vault_owned_records
 WHERE record_id=p_record AND owner_id=v_subject
 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;

 PERFORM 1 FROM ${qualified}.vault_write_grants
 WHERE subject_id=v_subject
 AND permission='healthwise.record.note.write' AND active=true
 FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;

 UPDATE ${qualified}.vault_owned_records SET note=p_note
 WHERE record_id=p_record AND owner_id=v_subject;
 RETURN FOUND;
END
$vault$`;
}
