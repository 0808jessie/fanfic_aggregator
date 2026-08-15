FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN python3 -m venv /opt/fastapi-venv \
    && /opt/fastapi-venv/bin/pip install --no-cache-dir -r fastapi_app/requirements.txt \
    && npm install -g corepack@latest \
    && corepack pnpm install \
    && corepack pnpm run build

ENV NODE_ENV=production
ENV PATH="/opt/fastapi-venv/bin:${PATH}"

CMD ["node", "dist/index.js"]
