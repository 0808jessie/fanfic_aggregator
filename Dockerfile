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
ENV FASTAPI_PYTHON_BIN="/opt/fastapi-venv/bin/python3"
# The public container exposes only Node's runtime PORT. FastAPI stays private
# on loopback:8000 and is reached by the same-origin Express proxy, avoiding
# deployment-instance Unix-socket lifecycle issues.
ENV FASTAPI_BASE_URL="http://127.0.0.1:8000"
ENV FASTAPI_PORT="8000"

CMD ["node", "dist/index.js"]
