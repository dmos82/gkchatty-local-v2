# GKChatty Local - Backend Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build TypeScript
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy necessary files
COPY .env.example ./.env

# Create data directories
RUN mkdir -p ./data/documents ./data/embeddings ./logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 6001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:6001/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
