# The 30-sign-in setting

The beginner path is Supabase **Authentication → Rate Limits → Anonymous sign-ins**. This is **new accounts/hour/public IP**, not a 30-player room cap. There is no hard-coded 30-player limit in the app.

Choose headroom for simultaneous first-time students and rehearsal devices. Example planning value: 500/hour/IP for a class of roughly 150, with CAPTCHA enabled. This changes an Auth allowance only; it is not a load-test result or a guarantee of 500 simultaneous players. Check the project's separate Realtime/database quotas and test the actual campus network. Keep students in their original browser profile; clearing storage creates a new identity rather than recovering the old one.

Official sources, checked 2 October 2026: [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [anonymous sign-ins and CAPTCHA](https://supabase.com/docs/guides/auth/auth-anonymous), [Realtime quotas](https://supabase.com/docs/guides/realtime/limits).

## Optional Management API method

Use this only from your **private local terminal**, with your own Supabase account management token. It is not the publishable key and must never enter the repository or a browser. Dashboard editing is simpler.

```sh
# Set these privately in your terminal environment first:
# SUPABASE_ACCESS_TOKEN = your account management token
# PROJECT_REF = the identifier in your project's Supabase URL

# Read the current configuration; record your original limit before changing it.
curl --fail-with-body   "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"   -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

# Example: change ONLY the anonymous-users allowance.
curl --fail-with-body -X PATCH   "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth"   -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"   -H "Content-Type: application/json"   --data '{"rate_limit_anonymous_users":500}'
```

Verify the saved setting in the dashboard. Other endpoints have independent limits and token buckets: raising anonymous sign-ins does not raise token-refresh or ordinary password sign-in limits. A long-session rehearsal should include token refresh. Restore temporarily enlarged settings after the class. Do not forge forwarded-IP headers or expose secret keys to avoid a shared-IP limit.
