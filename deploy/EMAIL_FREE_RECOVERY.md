# Email-free administrator recovery and safe deployment

No email sender is configured or required. Admin login still uses the stored email address as an identifier. Cashfree credentials remain mandatory for payment-enabled production startup.

## Recover an existing administrator

Run only from an authorized shell on the VPS or an equivalent isolated maintenance host. Verify the intended admin email before changing it. Passwords must never appear in command arguments, terminal output, tickets, or logs.

1. Create a strong new password in a private file on the VPS using your approved secret-handling process. Set mode `0600` and keep it owned by the account running Docker Compose. Do not place it under `data/uploads`, a web root, or the Git checkout.
2. From the deployment directory, run the command below. The password is passed through standard input to a temporary file owned by the backend container's `node` user. The temporary file is removed on exit.

```sh
docker compose exec -T backend sh -c 'umask 077; trap "rm -f /tmp/gbz-admin-recovery-password" EXIT; cat > /tmp/gbz-admin-recovery-password; npm run admin:recover -- --email admin@example.com --password-file /tmp/gbz-admin-recovery-password' < /secure/path/to/new-password
```

Replace the example email and file path. The file must contain 12–256 characters followed by at most one newline. After success, delete the host password file with your normal secret-handling process. The command changes the password hash, clears any historical reset token, revokes all sessions for that admin, and records an identifier-only timestamped audit line in backend logs. Existing profile, role, competitions, registrations, payments, and images are unchanged. The command refuses inactive or unknown accounts and does not create new admins.

An admin who knows the current password can change it from the authenticated Profile page; that also revokes existing sessions.

## Apply this release safely

1. Back up PostgreSQL and `data/uploads` and verify a restore in isolation. Record the current Git commit and migration status.
2. Pull the reviewed release commit on a **separate staging deployment**, configure HTTPS and a separate domain, and keep `STAGING_MODE=true`, `CASHFREE_ENV=sandbox`, and `STAGING_REGISTRATIONS_ENABLED=false`. Use real Cashfree sandbox credentials; payment-enabled startup will refuse missing credentials. No SMTP variables or provider account are needed.
3. Validate `.env.production`, run `docker compose config --quiet`, build images, and run `backend` Prisma migration history checks against a restored copy before applying any migrations. Do not reset the database or remove the preserved historical email columns.
4. Start staging and check health, admin login/recovery, session revocation, participant registration confirmation and payment references, signed Cashfree webhooks/refunds, admin history, image persistence, and backups. Open staging registrations only for controlled sandbox tests, then close them again.
5. For a later production cutover, use `STAGING_MODE=false`, `CASHFREE_ENV=production`, production Cashfree credentials, HTTPS, and an approved deployment window. This document does not authorize live payment testing or a production change.

The application was changed and tested locally only; no VPS operation has been performed by this task.
