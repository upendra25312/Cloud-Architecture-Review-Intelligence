FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    RENDERER_MAX_FILE_BYTES=52428800 \
    RENDERER_MAX_PAGES=20 \
    RENDERER_COMMAND_TIMEOUT_MS=120000 \
    RENDERER_DPI=160

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-dejavu \
      fonts-liberation \
      libreoffice \
      libreoffice-impress \
      libreoffice-writer \
      libreoffice-calc \
      poppler-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

USER node

EXPOSE 8080

CMD ["node", "src/server.js"]
