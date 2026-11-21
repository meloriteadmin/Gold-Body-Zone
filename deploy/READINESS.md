# Deployment readiness

**READY FOR VPS STAGING DEPLOYMENT; NOT READY FOR PRODUCTION LAUNCH.**

The current evidence, fixes, test counts and required staging checks are in [the pre-deployment audit](../docs/PRE_DEPLOYMENT_AUDIT.md). Cashfree has not been verified with actual sandbox credentials. Staging must use `STAGING_MODE=true`, `CASHFREE_ENV=sandbox`, a separate HTTPS origin, and `STAGING_REGISTRATIONS_ENABLED=false` until controlled tests begin.
