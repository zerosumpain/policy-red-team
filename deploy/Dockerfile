# Policy Red Team, as one container.
#
# WHY A CONTAINER AT ALL. This service has no database server, no cache and no
# second process — the whole thing is one Node process and one directory. That
# makes it easy to run and awkward to get approved: an estate that deploys
# containers has a path for a container and no path for "copy a tree onto a VM
# and write a unit file". This is that path.
#
#   docker build -f deploy/Dockerfile -t policy-red-team .
#   docker run --rm -p 5290:5290 \
#     -v policy-data:/data -v policy-keys:/keys \
#     -e POLICY_HOST=0.0.0.0 \
#     -e POLICY_SETUP_TOKEN=choose-something \
#     policy-red-team
#
# TWO VOLUMES, AND BOTH MATTER. `/data` is the database; `/keys` holds the key
# that decrypts every stored credential AND the per-run sealing keys. Losing the
# second is not an inconvenience: a sealed run whose key is gone is gone, by
# design, and a settings key that is gone makes every credential read as unset.
# See the README's "Backing it up".
FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app

# Dependencies first, so a source change does not re-resolve the tree.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# ── The image that actually ships ───────────────────────────────────────────
#
# `npm ci --omit=dev` rather than copying the build stage's node_modules: the
# build needs Vite, esbuild, Playwright and sass, and none of them is needed to
# serve. It is a second resolution of the same lockfile, which is safe, and it
# is what keeps the image from carrying a browser nobody will start.
FROM node:22.23.2-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/static ./static
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

# NOT root. The process needs to write only the two volumes below.
RUN mkdir -p /data /keys && chown -R node:node /data /keys
USER node

ENV POLICY_PORT=5290 \
    POLICY_HOST=127.0.0.1 \
    POLICY_DATA_DIR=/data/db \
    POLICY_SEAL_KEY_DIR=/keys

EXPOSE 5290
VOLUME ["/data", "/keys"]

# `/health` is exempt from every gate and says only `{"ok":true}`, which is
# exactly what a health check needs and nothing a stranger can use.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.POLICY_PORT||5290)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
