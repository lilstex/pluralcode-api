# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL — required by Prisma on slim images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_OPTIONS=--max-old-space-size=2048

COPY package*.json ./
COPY prisma ./prisma

# Skip postinstall (prisma generate) during npm ci — run it explicitly below
RUN npm ci --legacy-peer-deps --no-audit --no-fund --ignore-scripts

# Now schema exists, generate Prisma client
RUN npx prisma generate --schema=./prisma/schema/schema.prisma

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048

# Copy dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
# Copy compiled source files (flatten src into dist)
COPY --from=builder /app/dist/src ./dist
# Copy prisma folder
COPY --from=builder /app/prisma ./prisma

EXPOSE 2200
CMD ["node", "dist/main"]