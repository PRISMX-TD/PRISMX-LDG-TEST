# syntax=docker/dockerfile:1
FROM node:20-bullseye

RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "dist/index.cjs"]

