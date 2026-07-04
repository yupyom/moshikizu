# Moshikizu コラボサーバー（セルフホスト用）
#
#   docker build -t moshikizu .
#   docker run -d -p 8940:8940 -v moshikizu-data:/data --name moshikizu moshikizu
#   docker exec -it moshikizu node server/index.js adduser <name> <password>
#
# IP制限などの設定はボリューム内の /data/config.json を編集して再起動。

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
# Electronバイナリはサーバービルドに不要（ダウンロードをスキップ）
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build -w @draw/web && npm run build -w @draw/server

# ---- runtime ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    MOSHIKIZU_DATA_DIR=/data \
    MOSHIKIZU_STATIC=/app/web \
    MOSHIKIZU_PORT=8940
COPY --from=build /app/apps/server/dist/index.js ./server/index.js
COPY --from=build /app/apps/web/dist ./web
# サーバーバンドルの唯一の外部依存（ネイティブモジュール）
RUN npm install --no-save better-sqlite3@^12 && npm cache clean --force
VOLUME /data
EXPOSE 8940
CMD ["node", "server/index.js"]
