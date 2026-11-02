FROM node:22-alpine AS builder

WORKDIR /app

# package-lock.json pins the image; the mirror repo that deploys mcp-dev has
# no root bun.lock. Refresh it with `npm install --package-lock-only` after a
# package.json change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY public ./public
COPY README.md ./
COPY LICENSE ./

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
