FROM node:24.18.0-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/contract/package.json ./packages/contract/
COPY backend/package.json ./backend/

# Install deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/contract ./packages/contract
COPY backend ./backend

# Generate the Prisma client so backend type-checking during `nest build` resolves
# the generated model types (User, Session, Prisma.InputJsonValue, …).
RUN cd backend && npx prisma generate

# Build contract then backend
RUN pnpm --filter @game-ledger/contract build
RUN pnpm --filter @game-ledger/backend build

FROM node:24.18.0-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# openssl: provides the binary Prisma probes to detect the OpenSSL version so it
# loads the matching (openssl-3.0.x) query engine instead of defaulting to 1.1.x.
RUN apk add --no-cache postgresql16-client openssl

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/contract/package.json ./packages/contract/
COPY backend/package.json ./backend/

# Full install (not --prod): the Prisma CLI is a devDependency and is needed to
# `prisma generate` the runtime client below. pnpm's virtual store makes copying
# the builder's generated client across stages brittle, so we regenerate here.
RUN pnpm install --frozen-lockfile

COPY --from=builder /app/packages/contract/dist ./packages/contract/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY backend/prisma ./backend/prisma
COPY modules ./modules

WORKDIR /app/backend
RUN npx prisma generate

CMD ["node", "dist/main"]
