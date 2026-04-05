# PLRCAP Backend — Email & CI/CD Implementation Notes

> **Purpose:** Handover reference for the developer team covering the Mailtrap email integration, Container App environment configuration, and CI/CD pipeline setup on Azure.

---

## 1. Email Provider — Mailtrap (Live Sending)

The backend uses **Mailtrap Email Sending** for transactional email via SMTP.

### Sending Domain
- **Domain:** `ngosupporthub.ng`
- **Status:** Verified on Mailtrap

### SMTP Credentials

| Variable | Value |
|----------|-------|
| `MAIL_HOST` | `live.smtp.mailtrap.io` |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` | `api` |
| `MAIL_PASSWORD` | *(retrieve from Mailtrap Dashboard → Settings → API Tokens)* |
| `EMAIL_FROM` | `noreply@ngosupporthub.ng` |

> **Note:** `MAIL_PASSWORD` is the Mailtrap API token, not a traditional password. Retrieve it from **Mailtrap → Settings → API Tokens**.

---

## 2. Azure Container App — Environment Variables

The application runs on **Azure Container Apps** (`plrcap-backend`, resource group `plrcap-rg`, region `West Europe`).

All environment variables are set directly on the Container App — they are **not** managed through GitHub Secrets or CI/CD. They persist across deployments and new revisions.

### Current Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `PORT` | `2200` |
| `DATABASE_URL` | PostgreSQL connection string (Azure Flexible Server) |
| `JWT_SECRET` | Auth token signing secret |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob/File/Queue/Table storage |
| `JITSI_APP_ID` | Jitsi Meet app identifier |
| `JITSI_DOMAIN` | Jitsi Meet domain |
| `JITSI_USE_RS256` | `false` |
| `JITSI_APP_SECRET` | Jitsi JWT signing secret |
| `MAIL_HOST` | `live.smtp.mailtrap.io` |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` | `api` |
| `MAIL_PASSWORD` | Mailtrap API token |
| `EMAIL_FROM` | `noreply@ngosupporthub.ng` |

### Updating Environment Variables

```bash
az containerapp update \
  --name plrcap-backend \
  --resource-group plrcap-rg \
  --set-env-vars \
    "VARIABLE_NAME=value"
```

Each update creates a new revision. Verify with:

```bash
az containerapp show \
  --name plrcap-backend \
  --resource-group plrcap-rg \
  --query "properties.template.containers[0].env" \
  --output table
```

---

## 3. Container Registry (ACR)

- **Registry:** `plrcapregistry.azurecr.io`
- **Image:** `plrcapregistry.azurecr.io/plrcap-backend:latest`
- The Container App is configured to track the `:latest` tag and auto-pull on new pushes.
- ACR credentials are stored inside the Container App and referenced via secret `plrcapregistryazurecrio-plrcapregistry`.

---

## 4. CI/CD Pipeline — GitHub Actions

**Trigger:** Push to the `ci` branch, or manual `workflow_dispatch`.

### What the pipeline does

1. Checks out code
2. Sets up Node.js 20
3. Logs into ACR using `ACR_USERNAME` and `ACR_PASSWORD` secrets
4. Builds a multi-platform (`linux/amd64`) Docker image and pushes both `:sha` and `:latest` tags to ACR
5. Installs dependencies and generates the Prisma client
6. Runs Prisma migrations against the production database
7. Azure Container App auto-pulls the new `:latest` image within a few minutes

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `ACR_USERNAME` | ACR admin username (`plrcapregistry`) |
| `ACR_PASSWORD` | ACR admin password |
| `DATABASE_URL` | PostgreSQL connection string for Prisma migrations |

> **Important:** Environment variables (Mailtrap, Jitsi, JWT, etc.) are **not** managed through GitHub Secrets. They live on the Container App and are unaffected by CI deployments.

---

## 5. Deployment Flow Summary

```
Developer pushes to ci branch
        │
        ▼
GitHub Actions builds Docker image
        │
        ▼
Image pushed to ACR (:sha + :latest)
        │
        ▼
Prisma migrations run against production DB
        │
        ▼
Azure Container App auto-pulls :latest
        │
        ▼
New revision created → traffic routed (100%)
```

---

## 6. Key Resources

| Resource | Value |
|----------|-------|
| Container App URL | `https://plrcap-backend.ambitiousground-313553a9.westeurope.azurecontainerapps.io` |
| Resource Group | `plrcap-rg` |
| ACR | `plrcapregistry.azurecr.io` |
| Region | `West Europe` |
| Mailtrap Dashboard | `https://mailtrap.io` |

---

*Last updated: March 2026*