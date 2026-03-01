# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL — required by Prisma on slim images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_OPTIONS=--max-old-space-size=2048

COPY package*.json ./

# Copy prisma schema BEFORE npm ci so the postinstall `prisma generate` can find it
COPY prisma ./prisma

RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app

# OpenSSL also needed at runtime by Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 2200
CMD ["node", "dist/main"]