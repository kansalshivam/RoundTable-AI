FROM node:23-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY app/package*.json ./
RUN npm ci

FROM deps AS build
COPY app ./
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate --schema ./prisma/schema.prisma
RUN mkdir -p ./src/generated && mv ./app/src/generated/prisma ./src/generated/prisma
RUN npm run build

FROM node:23-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/src/generated/prisma ./dist-server/generated/prisma
COPY --from=build /app/package*.json ./
COPY prisma ./prisma
EXPOSE 3000
CMD ["npm", "run", "start"]
