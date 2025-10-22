# apps/web/Dockerfile - Isolated tsconfig.json Copy in Multi-Stage

# --- Stage 0: Source Copy ---
# Use a minimal image to just copy the build context (entire monorepo)
FROM alpine:latest AS source_copier

# Set a temporary working directory inside this stage
WORKDIR /app_source

# Explicitly copy the tsconfig.json file first
COPY apps/web/tsconfig.json ./apps/web/

# Copy the rest of the build context (monorepo excluding the tsconfig we just copied)
# Using .dockerignore or similar is complex here, simpler to just copy the rest.
# This will likely re-copy the tsconfig.json but it's harmless.
COPY . .


# --- Stage 1: Builder ---
FROM node:22-alpine AS builder
ARG NEXT_PUBLIC_API_BASE_URL
ARG API_INTERNAL_URL

# Set WORKDIR to the intended monorepo root inside this stage
WORKDIR /usr/src/app

# Install necessary build tools and pnpm
RUN apk add --no-cache python3 make g++ git py3-setuptools pkgconfig pixman-dev cairo-dev pango-dev giflib-dev jpeg-dev
RUN npm install -g pnpm@10.7.1

# --- Copy tsconfig.json from the source_copier stage ---
# Copy the explicitly copied tsconfig.json into the builder stage
COPY --from=source_copier /app_source/apps/web/tsconfig.json /usr/src/app/apps/web/tsconfig.json

# --- Copy the rest of the source code from the source_copier stage ---
# This includes package.json, pnpm-lock.yaml, pnpm-workspace.yaml, apps/* (except tsconfig.json), packages/*
COPY --from=source_copier /app_source/. /usr/src/app/

# Copy necessary config files to the root for pnpm to work correctly
COPY --from=source_copier /app_source/package.json ./
COPY --from=source_copier /app_source/pnpm-lock.yaml ./
COPY --from=source_copier /app_source/pnpm-workspace.yaml ./

# --- Perform a full pnpm install for the entire monorepo ---
RUN echo "--- Performing full monorepo pnpm install ---" && \
    pnpm install --frozen-lockfile

# Build the types package - ESSENTIAL for Next.js build to resolve imports
RUN echo "--- Building packages/types ---" && \
    pnpm --filter types build

# Optional: Add checks to verify the types build output
RUN echo "--- Listing contents of packages/types/dist AFTER BUILD ---" && \
    ls -la ./packages/types/dist/ || echo "./packages/types/dist/ NOT found or listable"
RUN echo "--- Content of packages/types/package.json AFTER BUILD ---" && \
    cat ./packages/types/package.json || echo "./packages/types/package.json NOT found"

# --- Copy and execute script to copy pdf.worker.js (AFTER INSTALL) --- 
# --- REMOVED SCRIPT EXECUTION AND DEBUG STEPS ---

# Copy the web app package.json separately to ensure it's in the right place relative to the monorepo root
COPY --from=source_copier /app_source/apps/web/package.json ./apps/web/

# Build the web app
WORKDIR /usr/src/app/apps/web

# Copy next.config.mjs into the build context directory (Corrected source path)
COPY apps/web/next.config.mjs .

# Make build args available as env vars for the build command
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN echo "--- Building web app (Ultra-Simplified - From app directory) ---" && pnpm build


# --- Runner Stage ---
# Using Node.js runtime is required by standalone output
FROM node:22-alpine AS runner
ARG API_INTERNAL_URL

# Also need build tools/libs for sharp AND pnpm
RUN apk add --no-cache python3 make g++ git libstdc++ vips-dev py3-setuptools && npm install -g pnpm@10.7.1

# Create non-root user and the WORKDIR, setting ownership
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app

# Set the working directory to the root of the application in the runner
WORKDIR /app

# Copy essential package files and lockfile from the builder stage
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/pnpm-lock.yaml ./pnpm-lock.yaml

# Copy the standalone output, which includes necessary node_modules
# The standalone output should contain a subset of node_modules relevant to the server
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/apps/web/.next/standalone/ ./ 

# Copy the *built* static assets from .next/static/ in the builder.
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/apps/web/.next/static/ ./apps/web/.next/static/

# Copy the public directory static assets from the builder.
COPY --from=builder --chown=nextjs:nodejs /usr/src/app/apps/web/public/ ./apps/web/public/

# --- Copy pdf.worker.js DIRECTLY from builder stage's .pnpm dir to public directory --- 
COPY --from=builder --chown=nextjs:nodejs \
    /usr/src/app/node_modules/.pnpm/pdfjs-dist@4.8.69/node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
    ./apps/web/public/pdf.worker.min.js 
RUN echo "--- Copied pdf.worker.min.js DIRECTLY to ./apps/web/public/ ---"

# Set runtime environment variables from build args
ENV NODE_ENV=production
ENV API_INTERNAL_URL=$API_INTERNAL_URL
# NEXT_PUBLIC_API_BASE_URL is automatically handled by Next.js build

# Ensure the nextjs user owns the application files *after* copying and installing deps
RUN chown -R nextjs:nodejs /app

# Set the user for running the application
USER nextjs

# Expose the port Next.js runs on
EXPOSE 3000

# The command to run the standalone server - Using shell form
# This is executed relative to the WORKDIR (/app)
CMD node apps/web/server.js
