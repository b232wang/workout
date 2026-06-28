FROM node:22-slim

# Build deps are a fallback; better-sqlite3 usually downloads a prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/health.db
EXPOSE 8080
VOLUME ["/data"]

CMD ["node", "src/server.js"]
