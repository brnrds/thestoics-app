# Kamino Deployment Guide

This document defines the standard deployment pattern for `kamino`.

It is meant to be followed by humans and agents. Treat it as policy, not suggestion.

## Agent Checklist

Use this order for any new deployment on `kamino`:

1. Identify the deployment target:
   domain or service name, repo, app type, required localhost port, and whether a new public hostname is needed.
2. Check the repo shape:
   confirm the repo has `Dockerfile`, `compose.yml`, and `.env.example`, or add them first.
3. Confirm the repo is already available on GitHub.
   If the local repo has not been pushed yet, stop and ask the user.
4. Check whether DNS already points to `kamino` if the app needs a public domain.
5. Create the deployment directory:
   `/home/bcsantos/apps/<domain-or-service>/app`
6. Clone the repo there using the normal Git remote.
7. Stop and ask the user before creating the server-side `.env`.
   Agents must not infer or inspect environment variable values or shapes on their own.
8. Create the server-side `.env` only after the user provides the required guidance or values.
9. Start the stack with `docker compose up -d --build`.
10. Verify the app locally on `127.0.0.1:<port>` before touching `nginx`.
11. If this is a new public domain or subdomain:
   create the temporary HTTP site, verify reachability, run `certbot`, then replace the temporary site with the proxy config.
12. Configure or update `nginx` to proxy to `127.0.0.1:<port>`.
13. Verify end to end:
   `docker compose ps`, local `curl`, `nginx -t`, and public `curl`.
14. If blocked by missing DNS, missing repo access, or other external setup, stop and ask the user.

## Core Rules

1. Use normal Git remotes such as `git@github.com:brnrds/repo.git`.
2. System `nginx` owns ports `80` and `443`.
3. Public traffic enters only through system `nginx`.
4. Application containers must not be publicly exposed.
5. Bind app containers to `127.0.0.1:<host-port>`.
6. Keep secrets on the server in `.env` files. Do not commit them.
7. Use one Docker Compose project per deployed repo.
8. App code lives under `/home/bcsantos/apps`.

## Directory Layout

For a public app with domain `example.com`:

```text
/home/bcsantos/apps/example.com/
  app/                  git checkout
```

Inside the repo checkout:

```text
/home/bcsantos/apps/example.com/app/
  Dockerfile
  compose.yml
  .env                  server-only, not committed
  .env.example          safe template, committed
```

For an internal service with no public domain:

```text
/home/bcsantos/apps/service-name/
  app/
```

## Standard Deployment Pattern

The standard pattern is:

- repo cloned on `kamino`
- app built with Docker
- app started with `docker compose`
- app port bound to `127.0.0.1`
- `nginx` reverse-proxies to that localhost port
- TLS handled by host `certbot` and host `nginx`

## Required Repo Files

Each deployable app repo should include:

- `Dockerfile`
- `.dockerignore`
- `compose.yml`
- `.env.example`
- app source

For Next.js, prefer:

- multi-stage Docker build
- production `next build`
- `next start` or standalone output
- one container exposing `3000` internally

## Port Policy

### Public apps

- Container internal port: usually `3000`
- Host bind: `127.0.0.1:<unique-port>:3000`
- Example: `127.0.0.1:3100:3000`

### Databases, queues, admin tools

Default policy:

- do not publish ports publicly
- prefer no host port publishing at all
- let only sibling containers reach them on the Compose network

If host access is required:

- publish to `127.0.0.1` only
- never publish to `0.0.0.0` unless explicitly requested

Examples:

- PostgreSQL for host-local access only: `127.0.0.1:5434:5432`
- Redis for host-local access only: `127.0.0.1:6380:6379`

## Git Policy

Normal clone and pull flow:

```bash
git clone git@github.com:brnrds/repo.git /home/bcsantos/apps/example.com/app
cd /home/bcsantos/apps/example.com/app
git pull --ff-only
```

Do not:

- work around Git access with ad hoc file copies unless explicitly instructed

If Git access fails, stop and ask the user.

If the repo exists only locally and has not been pushed to GitHub yet, stop and ask the user. Do not deploy from an ad hoc local copy unless explicitly instructed.

## Next.js App Tutorial

Use these placeholder values and replace them consistently:

- `<domain>`: public hostname, for example `app.example.com`
- `<repo>`: Git repo, for example `git@github.com:brnrds/my-app.git`
- `<port>`: unique localhost port on `kamino`, for example `3100`

### 1. Prepare the repo

The repo should contain at minimum:

```text
Dockerfile
compose.yml
.dockerignore
.env.example
```

Recommended `compose.yml` pattern:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "127.0.0.1:<port>:3000"
```

### 2. Clone on kamino

```bash
mkdir -p /home/bcsantos/apps/<domain>
git clone <repo> /home/bcsantos/apps/<domain>/app
```

### 3. Create server-side env file

```bash
cd /home/bcsantos/apps/<domain>/app
cp .env.example .env
```

Edit `.env` only on the server if needed.

### 4. Build and start

```bash
cd /home/bcsantos/apps/<domain>/app
docker compose up -d --build
```

### 5. Verify container locally

```bash
docker compose ps
curl -I http://127.0.0.1:<port>
```

### 6. Configure nginx

Pattern:

```nginx
server {
    server_name <domain>;

    location / {
        proxy_pass http://127.0.0.1:<port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen [::]:443 ssl;
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

### 7. Test and reload nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://<domain>
```

## New Domain Or Subdomain Procedure

Use this procedure whenever a new domain or subdomain needs to go live on `kamino`.

### 1. Decide the deployment values

Pick and record:

- `<domain>`
- `<repo>`
- `<port>`
- app type: Next.js, static site, API, database-backed app, etc.

The port must be unique on `kamino` and bound to localhost only.

### 2. Confirm DNS

Make sure the A record for `<domain>` points to `kamino`.

If DNS is not ready, stop and ask the user.

### 3. Create the app directory and deploy the repo

```bash
mkdir -p /home/bcsantos/apps/<domain>
git clone <repo> /home/bcsantos/apps/<domain>/app
cd /home/bcsantos/apps/<domain>/app
cp .env.example .env
docker compose up -d --build
```

### 4. Verify the app locally first

```bash
curl -I http://127.0.0.1:<port>
docker compose ps
```

Do not touch `nginx` until this works.

### 5. Create a temporary HTTP nginx site

Create a basic site for `<domain>` on port `80` so the host can answer HTTP requests and ACME challenges.

Minimal pattern:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <domain>;

    root /var/www/<domain>;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

Then:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Verify HTTP reaches kamino

```bash
curl -I http://<domain>
```

If the domain does not reach `kamino`, stop and ask the user.

Important:

- if a new hostname points to `kamino` but does not yet have its own `nginx` site and certificate, it may appear to serve the wrong app
- this is usually the existing origin fallback behavior, not a Docker problem
- do not assume the domain is correctly deployed just because it returns a page
- a new hostname is not complete until it has its own `server_name <domain>` configuration and certificate

### 7. Issue the certificate

Run:

```bash
sudo certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d <domain>
```

### 8. Replace the temporary site with the app proxy

Once the certificate exists, replace the temporary site with the reverse-proxy config:

```nginx
server {
    server_name <domain>;

    location / {
        proxy_pass http://127.0.0.1:<port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen [::]:443 ssl;
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

### 9. Test the public site

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I http://<domain>
curl -I https://<domain>
```

Confirm that the response is coming from the intended app, not just any existing app already configured on `kamino`.

### 10. Record the deployment

Keep a note of:

- domain
- repo
- local upstream port
- deployment path
- whether the app needs volumes, databases, or additional services

## Database Tutorial

Use Docker Compose for databases too.

Preferred pattern:

- dedicated Compose project
- named volumes for data
- no public port publishing
- optional localhost-only port if host tools need access

Example PostgreSQL service:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5434:5432"

volumes:
  postgres_data:
```

If only app containers need the database, remove `ports:` entirely.

## Shared Service Guidance

Use the same Docker rules for:

- PostgreSQL
- MySQL or MariaDB
- Redis
- Meilisearch
- MinIO
- worker containers
- cron-style sidecars

Prefer:

- one logical stack per project
- named volumes for persistent data
- container-to-container networking
- localhost-only published ports when unavoidable

Avoid:

- public database ports
- random manual processes outside Docker
- tmux-managed production services
- mixed supervision models for the same app

## Update Procedure

Standard app update:

```bash
cd /home/bcsantos/apps/example.com/app
git pull --ff-only
docker compose up -d --build
docker compose ps
```

If the app is public:

```bash
curl -I http://127.0.0.1:<port>
curl -I https://example.com
```

## Rollback Guidance

Minimum rollback strategy:

1. keep changes in git
2. identify previous working commit
3. on `kamino`:

```bash
cd /home/bcsantos/apps/example.com/app
git log --oneline -n 5
git checkout <previous-commit>
docker compose up -d --build
```

If a cleaner rollback workflow is needed later, add tags or a release branch strategy.

## Troubleshooting

### App is up but domain fails

Check:

```bash
curl -I http://127.0.0.1:<port>
sudo nginx -t
sudo systemctl status nginx --no-pager
```

### Domain works on HTTP but not HTTPS

Check:

```bash
sudo certbot certificates
sudo sed -n '1,220p' /etc/nginx/sites-available/<domain>
```

### Git pull fails

Check:

```bash
git remote -v
```

If Git access is not working, stop and ask the user.

### Container is unhealthy

Check:

```bash
docker compose ps
docker compose logs --tail=200
```

## What Agents Must Not Do

Agents must not:

- bypass the Git-based workflow with direct sync unless explicitly instructed
- expose app containers publicly
- expose databases publicly unless explicitly instructed
- run production apps under `tmux`
- replace system `nginx` with a containerized reverse proxy without explicit approval
- introduce Kubernetes or similar orchestration without explicit approval

## What Agents Should Do By Default

Agents should:

- use `/home/bcsantos/apps/<name-or-domain>/app`
- use standard GitHub remotes
- use Docker Compose
- bind app containers to `127.0.0.1`
- proxy public traffic through system `nginx`
- use host `certbot` for certificates
- ask the user when blocked by missing DNS, missing Git access, or other external dependencies

## Current Example

The reference app currently following this pattern is:

```text
Domain: blog.brnrds.com
Repo: git@github.com:brnrds/brnrds-blog.git
Path: /home/bcsantos/apps/blog.brnrds.com/app
Local upstream: 127.0.0.1:3100
Public entrypoint: system nginx
TLS: certbot on host
```
