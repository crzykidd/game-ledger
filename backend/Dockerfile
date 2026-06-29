FROM node:24-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/contract/package.json ./packages/contract/
COPY backend/package.json ./backend/

# Install deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/contract ./packages/contract
COPY backend ./backend

# Build contract then backend
RUN pnpm --filter @game-ledger/contract build
RUN pnpm --filter @game-ledger/backend build

FROM node:24-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN apk add --no-cache postgresql16-client

COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/contract/package.json ./packages/contract/
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/contract/dist ./packages/contract/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY backend/prisma ./backend/prisma
COPY modules ./modules

WORKDIR /app/backend
RUN npx prisma generate

CMD ["node", "dist/main"]
