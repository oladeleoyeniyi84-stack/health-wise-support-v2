# Healthwise — SECURITY DEFINER revocation execution readiness

**Engineering Vault — NO-GO.** Review of commit `d85403000d`; design gate only. No production migration or payment activation.

## Current state
`rebuild/db/010_review_revocation_function_design.sql` is a deliberately non-executable template: `REVIEWED_SCHEMA` is unresolved, and its function ownership and EXECUTE ACL are not provisioned. A passing CI workflow does not establish that this SQL has been deployed or exercised.

## Minimum isolated acceptance test
1. In a disposable PostgreSQL database only, provision a fixed schema owned by a dedicated NOLOGIN role. Create distinct LOGIN roles for the evidence writer and administrative revoker; never share their credentials.
2. Substitute the schema identifier in the reviewed SQL at build/test time using a fixed, safely quoted identifier. Reject any caller-supplied schema.
3. In **one transaction**, create the SECURITY DEFINER function, revoke PUBLIC EXECUTE, and grant EXECUTE exclusively to the revoker role. Verify ownership, `prosecdef`, `proconfig`, and effective EXECUTE ACL using PostgreSQL catalog queries.
4. Prove the writer and PUBLIC cannot execute the function, alter the function, modify the grant/session tables, change roles, or create objects in the protected schema. Prove the revoker cannot grant reviewer permissions or perform unrelated mutations.
5. From the trusted admin path, invoke revocation with a valid target and confirm both the reviewer grant and intended sessions become inactive; reject missing targets and malformed identifiers atomically.
6. Use two independent PostgreSQL connections: hold the authorization transaction lock while a revocation attempts to proceed, verify serialization, then prove all subsequent evidence writes are denied. Test the reverse ordering as well.
7. Confirm rollback leaves no partial revocation, duplicate grants cannot silently change row-count semantics, and revocation remains idempotent or explicitly rejects repeat requests according to the approved contract.
8. Confirm no public HTTP route, live Stripe API call, production database, entitlement change, or external infrastructure is involved.

## Threat-model cautions
- `SECURITY DEFINER` bypasses caller table privileges by design; a trusted administrator must authenticate and authorize the caller **before** invoking it. The SQL function alone cannot establish human identity.
- Function ownership, default PUBLIC EXECUTE, role membership, and schema CREATE rights must be checked explicitly. Search paths must not include writable attacker-controlled schemas.
- The current global advisory lock coordinates cooperating callers only; independent privileged SQL paths that ignore it remain a bypass. Deployment requires a restricted mutation boundary and operational review.
- Session revocation with a specified session ID currently also disables the operator's reviewer grant. Confirm this broader effect is intentional before execution.
- The template requires exactly one matching grant row; enforce a unique key for `(operator_id,permission)` before treating row-count checks as an invariant.

**Release decision: NO-GO until disposable execution evidence, operational identity integration, production recovery gates, and Founder approval are recorded.**
