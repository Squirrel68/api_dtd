FROM node:18.12-alpine3.16 AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --audit=false --fund=false

FROM base AS builder
RUN npm install --omit=optional --audit=false --fund=false
COPY . .
RUN npm run build

FROM builder AS runner
COPY --from=builder /app/build ./build
CMD ["npm", "run", "prod"]