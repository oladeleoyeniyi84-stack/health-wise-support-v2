# Phase 10: execution and release verification

The GitHub Actions workflow .github/workflows/healthwise-rebuild-tests.yml is configured to run npm test on pushes to rebuild/** and on pull requests touching rebuild/**. Its execution status is **not confirmed** by the assistant. Do not interpret test files or commits as proof of passing tests.

Local reproducible command (Node.js >= 20):

    cd rebuild
    npm test

The tests are dependency-free mocks/unit tests. They do NOT validate PostgreSQL concurrency, Stripe's real signature verifier, network timeouts, provider retries, migrations, or recovery. Integration tests require isolated, non-production services, explicit cost confirmation if applicable, and verification of test-only credentials.

Security note: Stripe API calls currently occur within the database transaction in the prototype. This is not production-ready: network latency can hold locks and degrade throughput. A future design should separate provider verification from the short atomic DB transaction, with replay-safe reconciliation and revalidation of the locked order. The current implementation remains Vault-only and must not be exposed as a public payment endpoint.
