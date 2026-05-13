# GroundX Middleware Scaffold

This service is the backend companion to `../app`. Deploy it beside the frontend and route same-origin `/api/*` traffic to this server.

GroundX Partner APIs own user registration, login, password reset, customer identity, API keys, projects, buckets, and groups. MySQL stores only app-specific metadata and session records that do not exist in GroundX.

```bash
npm install
npm run build
npm test
```

Copy `.env.example` to `.env.local` for local development. Do not place these secrets in the frontend scaffold.
