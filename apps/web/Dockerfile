# Build context must be the repository root.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web ./apps/web
COPY packages ./packages
COPY scripts ./scripts
COPY attached_assets ./attached_assets
COPY tsconfig.base.json tsconfig.json ./
RUN pnpm --filter @workspace/chat-widget... install --frozen-lockfile
# Public frontend build arguments only; never supply backend secrets.
ARG VITE_API_BASE_URL
ARG BASE_PATH=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV BASE_PATH=${BASE_PATH}
RUN pnpm --filter @workspace/chat-widget run build

FROM nginx:1.28-alpine AS runtime
COPY --from=build /app/apps/web/dist/public/ /usr/share/nginx/html/
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
RUN nginx -t
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
