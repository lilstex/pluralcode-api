# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL — required by Prisma on slim images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_OPTIONS=--max-old-space-size=4096

COPY package*.json ./
COPY prisma ./prisma

# Skip postinstall (prisma generate) during npm ci — run it explicitly below
RUN npm ci --legacy-peer-deps --no-audit --no-fund --ignore-scripts

# Disable SSL verification for npm and Node during Prisma binary download
RUN npm config set strict-ssl false

# Install prisma@6 and @prisma/client@6 explicitly then generate
RUN npm install --save-dev prisma@6 --legacy-peer-deps --strict-ssl=false
RUN npm install @prisma/client@6 --legacy-peer-deps --strict-ssl=false
RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema/schema.prisma

COPY . .
RUN node --max-old-space-size=4096 ./node_modules/.bin/nest build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Copy dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled source files (flatten src into dist)
COPY --from=builder /app/dist/src ./dist

# EJS email templates
COPY --from=builder /app/dist/views ./views

# Copy prisma folder
COPY --from=builder /app/prisma ./prisma

EXPOSE 2200
CMD ["node", "dist/main"]
