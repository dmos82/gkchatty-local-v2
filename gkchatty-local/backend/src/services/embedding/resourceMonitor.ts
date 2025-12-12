/**
 * GKChatty Local - Resource Monitoring
 *
 * Monitors system resources (disk space, memory) and provides warnings/errors
 * when resources are insufficient for embedding operations.
 *
 * @module services/embedding/resourceMonitor
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { DiskSpaceError, MemoryError } from './errors';

/**
 * Resource thresholds configuration
 */
export interface ResourceThresholds {
  /** Minimum free disk space in GB */
  minDiskSpaceGB: number;
  /** Minimum free memory in MB */
  minMemoryMB: number;
  /** Warning threshold for disk space in GB */
  warnDiskSpaceGB: number;
  /** Warning threshold for memory in MB */
  warnMemoryMB: number;
}

/**
 * Default resource thresholds
 */
export const DEFAULT_THRESHOLDS: ResourceThresholds = {
  minDiskSpaceGB: 2, // 2GB minimum
  minMemoryMB: 512, // 512MB minimum
  warnDiskSpaceGB: 5, // Warn at 5GB
  warnMemoryMB: 1024, // Warn at 1GB
};

/**
 * Resource status
 */
export interface ResourceStatus {
  disk: {
    totalGB: number;
    freeGB: number;
    usedGB: number;
    usedPercent: number;
    status: 'ok' | 'warning' | 'critical';
  };
  memory: {
    totalMB: number;
    freeMB: number;
    usedMB: number;
    usedPercent: number;
    status: 'ok' | 'warning' | 'critical';
  };
  timestamp: Date;
}

/**
 * Get disk space information for a path
 */
export function getDiskSpace(targetPath: string = os.homedir()): {
  totalGB: number;
  freeGB: number;
  usedGB: number;
  usedPercent: number;
} {
  try {
    let totalBytes = 0;
    let freeBytes = 0;

    if (process.platform === 'win32') {
      // SEC-007 FIX: Use spawnSync with argument array to prevent command injection
      const drive = path.parse(targetPath).root;
      // Validate drive letter format (e.g., "C:")
      const driveLetterMatch = drive.match(/^([A-Za-z]):[\\/]?$/);
      if (!driveLetterMatch) {
        console.error('[ResourceMonitor] Invalid drive format:', drive);
        return { totalGB: 0, freeGB: 0, usedGB: 0, usedPercent: 0 };
      }
      const driveLetter = driveLetterMatch[1].toUpperCase() + ':';

      // Use spawnSync with argument array (no shell interpolation)
      const result = spawnSync('wmic', [
        'logicaldisk',
        'where',
        `DeviceID='${driveLetter}'`,
        'get',
        'Size,FreeSpace'
      ], { encoding: 'utf-8' });

      if (result.error || result.status !== 0) {
        console.error('[ResourceMonitor] wmic command failed:', result.error || result.stderr);
        return { totalGB: 0, freeGB: 0, usedGB: 0, usedPercent: 0 };
      }

      const output = result.stdout;
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].trim().split(/\s+/);
        freeBytes = parseInt(values[0]);
        totalBytes = parseInt(values[1]);
      }
    } else {
      // SEC-007 FIX: Use spawnSync with argument array for Unix
      // Validate targetPath - must be an existing directory
      const resolvedPath = path.resolve(targetPath);
      if (!fs.existsSync(resolvedPath)) {
        console.error('[ResourceMonitor] Path does not exist:', resolvedPath);
        return { totalGB: 0, freeGB: 0, usedGB: 0, usedPercent: 0 };
      }

      const result = spawnSync('df', ['-k', resolvedPath], { encoding: 'utf-8' });

      if (result.error || result.status !== 0) {
        console.error('[ResourceMonitor] df command failed:', result.error || result.stderr);
        return { totalGB: 0, freeGB: 0, usedGB: 0, usedPercent: 0 };
      }

      const output = result.stdout;
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].trim().split(/\s+/);
        const totalKB = parseInt(values[1]);
        const usedKB = parseInt(values[2]);
        const availKB = parseInt(values[3]);

        totalBytes = totalKB * 1024;
        freeBytes = availKB * 1024;
      }
    }

    const totalGB = totalBytes / (1024 * 1024 * 1024);
    const freeGB = freeBytes / (1024 * 1024 * 1024);
    const usedGB = totalGB - freeGB;
    const usedPercent = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;

    return {
      totalGB: Math.round(totalGB * 100) / 100,
      freeGB: Math.round(freeGB * 100) / 100,
      usedGB: Math.round(usedGB * 100) / 100,
      usedPercent: Math.round(usedPercent * 100) / 100,
    };
  } catch (error) {
    console.error('[ResourceMonitor] Failed to get disk space:', error);
    return {
      totalGB: 0,
      freeGB: 0,
      usedGB: 0,
      usedPercent: 0,
    };
  }
}

/**
 * Get memory information
 */
export function getMemoryInfo(): {
  totalMB: number;
  freeMB: number;
  usedMB: number;
  usedPercent: number;
} {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;

  const totalMB = totalBytes / (1024 * 1024);
  const freeMB = freeBytes / (1024 * 1024);
  const usedMB = usedBytes / (1024 * 1024);
  const usedPercent = totalMB > 0 ? (usedMB / totalMB) * 100 : 0;

  return {
    totalMB: Math.round(totalMB),
    freeMB: Math.round(freeMB),
    usedMB: Math.round(usedMB),
    usedPercent: Math.round(usedPercent * 100) / 100,
  };
}

/**
 * Check resource status against thresholds
 */
export function checkResources(
  targetPath: string = os.homedir(),
  thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
): ResourceStatus {
  const disk = getDiskSpace(targetPath);
  const memory = getMemoryInfo();

  // Determine disk status
  let diskStatus: 'ok' | 'warning' | 'critical' = 'ok';
  if (disk.freeGB < thresholds.minDiskSpaceGB) {
    diskStatus = 'critical';
  } else if (disk.freeGB < thresholds.warnDiskSpaceGB) {
    diskStatus = 'warning';
  }

  // Determine memory status
  let memoryStatus: 'ok' | 'warning' | 'critical' = 'ok';
  if (memory.freeMB < thresholds.minMemoryMB) {
    memoryStatus = 'critical';
  } else if (memory.freeMB < thresholds.warnMemoryMB) {
    memoryStatus = 'warning';
  }

  return {
    disk: {
      ...disk,
      status: diskStatus,
    },
    memory: {
      ...memory,
      status: memoryStatus,
    },
    timestamp: new Date(),
  };
}

/**
 * Validate resources and throw error if insufficient
 */
export function validateResources(
  targetPath: string = os.homedir(),
  thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
): void {
  const status = checkResources(targetPath, thresholds);

  if (status.disk.status === 'critical') {
    throw new DiskSpaceError(thresholds.minDiskSpaceGB, status.disk.freeGB, {
      path: targetPath,
      status,
    });
  }

  if (status.memory.status === 'critical') {
    throw new MemoryError(thresholds.minMemoryMB, status.memory.freeMB, {
      status,
    });
  }

  // Log warnings
  if (status.disk.status === 'warning') {
    console.warn(
      `[ResourceMonitor] Low disk space warning: ${status.disk.freeGB}GB free (threshold: ${thresholds.warnDiskSpaceGB}GB)`
    );
  }

  if (status.memory.status === 'warning') {
    console.warn(
      `[ResourceMonitor] Low memory warning: ${status.memory.freeMB}MB free (threshold: ${thresholds.warnMemoryMB}MB)`
    );
  }
}

/**
 * Estimate required disk space for model download
 */
export function estimateModelSize(modelId: string): number {
  const modelLower = modelId.toLowerCase();

  // Model size estimates in GB
  if (modelLower.includes('minilm') || modelLower.includes('small')) {
    return 0.1; // 100MB
  }

  if (modelLower.includes('base') || modelLower.includes('medium')) {
    return 0.5; // 500MB
  }

  if (modelLower.includes('large') || modelLower.includes('xl')) {
    return 1.5; // 1.5GB
  }

  if (modelLower.includes('nomic')) {
    return 0.3; // 300MB
  }

  // Default estimate
  return 0.5;
}

/**
 * Estimate required memory for model loading
 */
export function estimateMemoryRequirement(modelId: string): number {
  const modelLower = modelId.toLowerCase();

  // Memory estimates in MB
  if (modelLower.includes('minilm') || modelLower.includes('small')) {
    return 256; // 256MB
  }

  if (modelLower.includes('base') || modelLower.includes('medium')) {
    return 512; // 512MB
  }

  if (modelLower.includes('large') || modelLower.includes('xl')) {
    return 2048; // 2GB
  }

  if (modelLower.includes('nomic')) {
    return 768; // 768MB
  }

  // Default estimate
  return 512;
}

/**
 * Check if sufficient resources for model
 */
export function canLoadModel(
  modelId: string,
  targetPath: string = os.homedir()
): { canLoad: boolean; reason?: string; status: ResourceStatus } {
  const requiredDiskGB = estimateModelSize(modelId);
  const requiredMemoryMB = estimateMemoryRequirement(modelId);

  const thresholds: ResourceThresholds = {
    minDiskSpaceGB: requiredDiskGB,
    minMemoryMB: requiredMemoryMB,
    warnDiskSpaceGB: requiredDiskGB * 2,
    warnMemoryMB: requiredMemoryMB * 1.5,
  };

  const status = checkResources(targetPath, thresholds);

  if (status.disk.status === 'critical') {
    return {
      canLoad: false,
      reason: `Insufficient disk space. Required: ${requiredDiskGB}GB, Available: ${status.disk.freeGB}GB`,
      status,
    };
  }

  if (status.memory.status === 'critical') {
    return {
      canLoad: false,
      reason: `Insufficient memory. Required: ${requiredMemoryMB}MB, Available: ${status.memory.freeMB}MB`,
      status,
    };
  }

  return {
    canLoad: true,
    status,
  };
}

/**
 * Get directory size recursively
 */
export async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
      } else if (entry.isDirectory()) {
        totalSize += await getDirectorySize(fullPath);
      }
    }
  } catch (error) {
    console.error(`[ResourceMonitor] Error calculating directory size for ${dirPath}:`, error);
  }

  return totalSize;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
}

/**
 * Resource monitor class for continuous monitoring
 */
export class ResourceMonitor {
  private interval: NodeJS.Timeout | null = null;
  private thresholds: ResourceThresholds;
  private targetPath: string;
  private listeners: Array<(status: ResourceStatus) => void> = [];

  constructor(
    targetPath: string = os.homedir(),
    thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
  ) {
    this.targetPath = targetPath;
    this.thresholds = thresholds;
  }

  /**
   * Start monitoring resources
   */
  start(intervalMs: number = 60000): void {
    if (this.interval) {
      console.warn('[ResourceMonitor] Already monitoring');
      return;
    }

    console.log(`[ResourceMonitor] Starting resource monitoring (interval: ${intervalMs}ms)`);

    // Check immediately
    this.check();

    // Then check periodically
    this.interval = setInterval(() => {
      this.check();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[ResourceMonitor] Stopped resource monitoring');
    }
  }

  /**
   * Check resources once
   */
  check(): ResourceStatus {
    const status = checkResources(this.targetPath, this.thresholds);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('[ResourceMonitor] Listener error:', error);
      }
    }

    return status;
  }

  /**
   * Add listener for resource status updates
   */
  onStatusChange(listener: (status: ResourceStatus) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Get current status
   */
  getStatus(): ResourceStatus {
    return checkResources(this.targetPath, this.thresholds);
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<ResourceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}
