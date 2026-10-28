/**
 * StreamForge CLI - Multi-Stage Container & Dockerfile Generator
 * Analyzes application runtime profiles and generates hardened, minimal production Dockerfiles
 */

export class DockerGenerator {
  constructor(options = {}) {
    this.nodeVersion = options.nodeVersion || '20';
    this.baseImage = options.baseImage || `node:${this.nodeVersion}-alpine`;
    this.port = options.port || 3000;
    this.workdir = options.workdir || '/app';
    this.healthcheckPath = options.healthcheckPath || '/health';
  }

  generateMultiStageDockerfile(pkgJson = {}) {
    const isTypeScript = Boolean(pkgJson.devDependencies?.typescript || pkgJson.dependencies?.typescript);
    const hasBuildScript = Boolean(pkgJson.scripts?.build);
    const startScript = pkgJson.scripts?.start ? 'npm start' : 'node index.js';

    const lines = [
      `# syntax=docker/dockerfile:1.4`,
      `# Generated with StreamForge Zero-Telemetry Automation Engine`,
      ``,
      `# -----------------------------------------------------------------------------`,
      `# Stage 1: Build & Dependencies Layer`,
      `# -----------------------------------------------------------------------------`,
      `FROM ${this.baseImage} AS builder`,
      `WORKDIR ${this.workdir}`,
      ``,
      `# Install dependencies based on preferred lockfile`,
      `COPY package*.json ./`,
      `RUN npm ci --prefer-offline --no-audit --progress=false`,
      ``,
      `# Copy application source files`,
      `COPY . .`,
    ];

    if (hasBuildScript || isTypeScript) {
      lines.push(
        ``,
        `# Execute build pipeline`,
        `RUN npm run build`,
        `RUN npm prune --production`
      );
    }

    lines.push(
      ``,
      `# -----------------------------------------------------------------------------`,
      `# Stage 2: Hardened Production Runtime Layer`,
      `# -----------------------------------------------------------------------------`,
      `FROM ${this.baseImage} AS runner`,
      `WORKDIR ${this.workdir}`,
      ``,
      `# Enforce production environment`,
      `ENV NODE_ENV=production`,
      `ENV PORT=${this.port}`,
      ``,
      `# Create unprivileged system user for process isolation`,
      `RUN addgroup --system --gid 1001 nodejs && \\`,
      `    adduser --system --uid 1001 appuser`,
      ``,
      `# Copy built artifacts and dependencies from builder stage`,
      `COPY --from=builder --chown=appuser:nodejs ${this.workdir}/node_modules ./node_modules`,
      `COPY --from=builder --chown=appuser:nodejs ${this.workdir}/package*.json ./`,
    );

    if (hasBuildScript || isTypeScript) {
      lines.push(`COPY --from=builder --chown=appuser:nodejs ${this.workdir}/dist ./dist`);
    } else {
      lines.push(`COPY --from=builder --chown=appuser:nodejs ${this.workdir}/lib ./lib`);
      lines.push(`COPY --from=builder --chown=appuser:nodejs ${this.workdir}/bin ./bin`);
    }

    lines.push(
      ``,
      `# Switch to unprivileged user`,
      `USER appuser`,
      ``,
      `EXPOSE ${this.port}`,
      ``,
      `# Container health probe`,
      `HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\`,
      `  CMD node -e "require('node:http').get('http://localhost:${this.port}${this.healthcheckPath}', (r) => { if (r.statusCode !== 200) process.exit(1); })" || exit 1`,
      ``,
      `CMD ["${startScript.split(' ')[0]}", "${startScript.split(' ').slice(1).join(' ')}"]\n`
    );

    return lines.join('\n');
  }

  generateDockerignore() {
    return [
      `# StreamForge Automated Docker Ignore Configuration`,
      `node_modules`,
      `npm-debug.log*`,
      `.git`,
      `.gitignore`,
      `.env*`,
      `!.env.example`,
      `coverage`,
      `.build-cache`,
      `dist`,
      `tests`,
      `*.md`,
      `Dockerfile*`,
      `docker-compose*`,
      `.DS_Store`,
      `Thumbs.db\n`,
    ].join('\n');
  }
}
