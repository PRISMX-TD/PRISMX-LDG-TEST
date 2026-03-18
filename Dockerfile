FROM node:20-bullseye AS builder
WORKDIR /app
COPY . .
RUN npm install --no-audit --no-fund --ignore-scripts
RUN npm run build

FROM node:20-bullseye AS runner
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts ./
COPY shared ./shared
ENV NODE_ENV=production
EXPOSE 5000
CMD npx drizzle-kit push && node dist/index.cjs
