FROM node:22-alpine AS base
RUN npm install -g pnpm@10
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS dev
RUN pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-alpine AS prod
RUN npm install -g pnpm@10
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main"]
