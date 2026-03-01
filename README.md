## Project: PLRCAP/NORCAP NGO Support Hub Upgrade

This is the backend service for the **PLRCAP NGO Support Hub**, built with **NestJS**, **Prisma ORM**, and **PostgreSQL**. This hub centralizes resources, expert networking, and organizational capacity building for Nigerian NGOs.

---

## 🛠 Prerequisites

- **Node.js** (v20 or higher)
- **PostgreSQL** instance (Local or Azure Database for PostgreSQL)
- **npm** or **yarn**

---

## ⚙️ Environment Setup

1. Clone the repository and install dependencies:

```bash
npm install

```

2. Create a `.env` file in the root directory:

```env
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
DATABASE_URL="postgresql://johndoe:mypassword@localhost:5432/plrcap_db?schema=public"

JWT_SECRET="your_super_secret_key"

```

---

## 🗄️ Prisma & Database Commands

As a backend engineer, you will frequently use these commands to keep your PostgreSQL schema and NestJS types in sync.

### 1. Format Schema

Always run this before committing to ensure your `schema.prisma` is clean and properly indented.

```bash
npx prisma format

```

### 2. Create Database & Run Migrations

Use this command to create your PostgreSQL tables based on your Prisma models. This will also generate the **Prisma Client**.

```bash
# This creates the DB if it doesn't exist and applies all changes
npx prisma migrate dev --name init

```

### 3. Sync Changes (Standard Update)

Whenever you modify the `schema.prisma` file, run:

```bash
npx prisma migrate dev

```

---

## 🚀 Running the App

```bash
# development
npm run start

# watch mode (highly recommended for dev)
npm run start:dev

# production mode
npm run start:prod

```

---

## 📝 API Documentation

Once the server is running, you can access the **Swagger UI** to test the endpoints (Registration, Login, etc.) at:
`http://localhost:3000/api/docs`

# PLRCAP Auth Module — Architecture Guide

## Directory Structure

```
src/
├── common/
│   ├── constants/
│   │   └── permissions.ts        # All permission keys + role default matrix
│   ├── decorators/
│   │   ├── current-user.decorator.ts   # @CurrentUser()
│   │   ├── roles.decorator.ts          # @Roles(Role.SUPER_ADMIN)
│   │   └── permissions.decorator.ts    # @Permissions('event:write')
│   ├── guards/
│   │   ├── jwt-auth.guard.ts           # Validates Bearer token
│   │   ├── roles.guard.ts              # Checks Role enum (coarse)
│   │   └── permissions.guard.ts        # Checks permission strings (fine-grained)
│   ├── strategies/
│   │   └── jwt.strategy.ts             # Hydrates req.user + adminPermissions
│   └── utils/
│       └── helpers.ts                  # generateOtp, otpExpiresAt, isExpired
│
├── providers/
│   ├── email/
│   │   ├── email.module.ts
│   │   └── email.service.ts            # Nodemailer + EJS templates
│   └── azure/
│       ├── azure.module.ts
│       └── azure-blob.service.ts       # Upload/delete to Azure Blob Storage
│
├── users/
│   ├── controller/
│   │   └── users.controller.ts
│   ├── dto/
│   │   └── users.dto.ts
│   ├── service/
│   │   └── users.service.ts
│   └── users.module.ts
│
└── prisma.service.ts
```

---

## Auth Flow Summary

### Registration

```
POST /api/v1/users/signup
→ Validates DTO (role cannot be admin role)
→ Hashes password (bcrypt, cost=12)
→ Creates Organization record (NGO_MEMBER only)
→ Generates 6-digit OTP + 15-min expiry
→ Sets status = PENDING (or APPROVED for GUEST)
→ Sends verification OTP email
→ Notifies all SUPER_ADMINs of new pending user
```

### Email Verification

```
POST /api/v1/users/verify-email  { email, otp }
→ Validates OTP + expiry
→ Sets isEmailVerified = true, clears otp fields
```

### Login

```
POST /api/v1/users/login
→ Checks password hash
→ Checks isEmailVerified
→ Checks account status (PENDING / REJECTED / SUSPENDED all blocked)
→ Signs JWT { sub: id, email, role }
→ Returns token + safe user object
```

### Forgot Password

```
POST /api/v1/users/forgot-password  { email }
→ Always returns success (prevents user enumeration)
→ Generates new OTP + expiry, sends email

POST /api/v1/users/reset-password  { email, otp, password }
→ Validates OTP + expiry
→ Hashes and saves new password, clears OTP fields
```

---

## RBAC & Permissions

### Two-layer protection on admin routes:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.SUPER_ADMIN, Role.EVENT_ADMIN)
@Permissions(PERMISSIONS.EVENT_WRITE)
```

**Layer 1 — RolesGuard**: Checks `user.role` against `@Roles(...)`.
**Layer 2 — PermissionsGuard**: Checks effective permissions against `@Permissions(...)`.

### Permission resolution:

1. If `adminPermission.permissions[]` exists in DB → use those (custom set by Super Admin).
2. Else → fall back to `ROLE_DEFAULT_PERMISSIONS[user.role]`.

### Assigning custom permissions (Super Admin only):

```
PATCH /api/v1/users/:id/permissions
Body: { "permissions": ["event:read", "event:write", "user:read"] }
```

This writes to the `AdminPermission` table and is audited.

---

## Azure Blob Storage

Three containers are used:

- `avatars` — profile pictures (max 2MB, JPEG/PNG/WEBP)
- `resources` — library documents and media
- `oda-evidence` — ODA Assessment uploaded evidence PDFs

Files are named with UUIDs to avoid collisions. Old avatars are deleted before uploading new ones.

---

## Email Templates Required

Create EJS templates in `views/`:

- `verification.ejs` — `{ fullName, email, otp }`
- `welcome.ejs` — `{ fullName, email, loginUrl }`
- `reset-password.ejs` — `{ fullName, email, otp }`
- `admin-approval.ejs` — `{ adminEmail, applicantName, applicantEmail, role, adminDashboardUrl }`
- `account-approved.ejs` — `{ fullName, email }`
- `account-rejected.ejs` — `{ fullName, email, reason }`

---

## Schema Changes Required

See `SCHEMA_ADDITIONS.prisma` for the two new fields and one new model to add.

Run:

```bash
npx prisma migrate dev --name add_email_verified_otp_expiry_admin_permissions
```

## Required npm Packages

```bash
npm install @azure/storage-blob
npm install uuid
npm install @types/multer
npm install @nestjs/platform-express
```
