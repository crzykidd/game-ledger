FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/contract/package.json ./packages/contract/
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile

COPY packages/contract ./packages/contract
COPY frontend ./frontend

# Build the shared contract package first — the frontend's tsc needs its dist/types.
RUN pnpm --filter @game-ledger/contract build
RUN pnpm --filter @game-ledger/frontend build

FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
# The nginx ingress config is in infra/nginx/; in prod the docker-compose
# mounts infra/nginx/nginx.conf into this container.
EXPOSE 80
