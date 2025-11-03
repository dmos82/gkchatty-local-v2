# Stage 1: Dependencies
FROM node:18-alpine AS dependencies
WORKDIR /app

# Install pnpm and Python (needed for sharp compilation fallback)
RUN apk add --no-cache python3 make g++ && \
    npm install -g pnpm@7.33.1

# Copy only package files for better caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

# Install ALL dependencies for the API (including dev dependencies for build stage)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --filter api --frozen-lockfile

# Stage 2: Build
FROM node:18-alpine AS builder
WORKDIR /app

# Install pnpm and build tools
RUN apk add --no-cache python3 make g++ git py3-setuptools && \
    npm install -g pnpm@7.33.1

# Copy installed dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/apps/api/node_modules ./apps/api/node_modules

# Copy package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

# Copy source files
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY packages/types/src ./packages/types/src

# Build the TypeScript code
RUN pnpm --filter api build

# Stage 3: Production
FROM node:18-alpine AS production
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@7.33.1

# Copy package files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

# Install only production dependencies with cache mount
RUN --mount=type=cache,id=pnpm-prod,target=/root/.local/share/pnpm/store \
    pnpm install --filter api --frozen-lockfile --prod --ignore-scripts

# Copy built application
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Set production environment
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3001

# Run the application
CMD ["node", "apps/api/dist/index.js"]
