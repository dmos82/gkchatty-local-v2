/**
 * Unit tests for resource monitoring
 */

import {
  getDiskSpace,
  getMemoryInfo,
  checkResources,
  validateResources,
  estimateModelSize,
  estimateMemoryRequirement,
  canLoadModel,
  ResourceMonitor,
  formatBytes,
  DEFAULT_THRESHOLDS,
} from '../resourceMonitor';
import { DiskSpaceError, MemoryError } from '../errors';

describe('Resource Information', () => {
  describe('getDiskSpace', () => {
    it('should return disk space info', () => {
      const disk = getDiskSpace();

      expect(disk).toHaveProperty('totalGB');
      expect(disk).toHaveProperty('freeGB');
      expect(disk).toHaveProperty('usedGB');
      expect(disk).toHaveProperty('usedPercent');

      expect(disk.totalGB).toBeGreaterThan(0);
      expect(disk.freeGB).toBeGreaterThanOrEqual(0);
      expect(disk.usedPercent).toBeGreaterThanOrEqual(0);
      expect(disk.usedPercent).toBeLessThanOrEqual(100);
    });

    it('should calculate used space correctly', () => {
      const disk = getDiskSpace();
      const calculatedUsed = disk.totalGB - disk.freeGB;

      // Allow small rounding difference
      expect(Math.abs(disk.usedGB - calculatedUsed)).toBeLessThan(0.1);
    });
  });

  describe('getMemoryInfo', () => {
    it('should return memory info', () => {
      const memory = getMemoryInfo();

      expect(memory).toHaveProperty('totalMB');
      expect(memory).toHaveProperty('freeMB');
      expect(memory).toHaveProperty('usedMB');
      expect(memory).toHaveProperty('usedPercent');

      expect(memory.totalMB).toBeGreaterThan(0);
      expect(memory.freeMB).toBeGreaterThanOrEqual(0);
      expect(memory.usedPercent).toBeGreaterThanOrEqual(0);
      expect(memory.usedPercent).toBeLessThanOrEqual(100);
    });

    it('should calculate used memory correctly', () => {
      const memory = getMemoryInfo();
      const calculatedUsed = memory.totalMB - memory.freeMB;

      // Allow small rounding difference
      expect(Math.abs(memory.usedMB - calculatedUsed)).toBeLessThan(1);
    });
  });
});

describe('Resource Status', () => {
  describe('checkResources', () => {
    it('should return resource status', () => {
      const status = checkResources();

      expect(status).toHaveProperty('disk');
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('timestamp');

      expect(status.disk.status).toMatch(/^(ok|warning|critical)$/);
      expect(status.memory.status).toMatch(/^(ok|warning|critical)$/);
      expect(status.timestamp).toBeInstanceOf(Date);
    });

    it('should mark status as critical if below minimum', () => {
      const status = checkResources(undefined, {
        minDiskSpaceGB: 999999, // Impossibly high
        minMemoryMB: 999999,
        warnDiskSpaceGB: 1000000,
        warnMemoryMB: 1000000,
      });

      expect(status.disk.status).toBe('critical');
      expect(status.memory.status).toBe('critical');
    });

    it('should mark status as warning if below warning threshold', () => {
      const disk = getDiskSpace();
      const memory = getMemoryInfo();

      const status = checkResources(undefined, {
        minDiskSpaceGB: 0,
        minMemoryMB: 0,
        warnDiskSpaceGB: disk.freeGB + 1, // Just above current
        warnMemoryMB: memory.freeMB + 1,
      });

      expect(status.disk.status).toBe('warning');
      expect(status.memory.status).toBe('warning');
    });

    it('should mark status as ok if sufficient resources', () => {
      const status = checkResources(undefined, {
        minDiskSpaceGB: 0.1,
        minMemoryMB: 100,
        warnDiskSpaceGB: 0.2,
        warnMemoryMB: 200,
      });

      // With very low thresholds, both should at least not be critical
      expect(status.disk.status).not.toBe('critical');
      expect(status.memory.status).not.toBe('critical');
    });
  });

  describe('validateResources', () => {
    it('should not throw if resources sufficient', () => {
      expect(() => {
        validateResources(undefined, {
          minDiskSpaceGB: 0.1,
          minMemoryMB: 100,
          warnDiskSpaceGB: 0.2,
          warnMemoryMB: 200,
        });
      }).not.toThrow();
    });

    it('should throw DiskSpaceError if disk critical', () => {
      expect(() => {
        validateResources(undefined, {
          minDiskSpaceGB: 999999,
          minMemoryMB: 100,
          warnDiskSpaceGB: 1000000,
          warnMemoryMB: 200,
        });
      }).toThrow(DiskSpaceError);
    });

    it('should throw MemoryError if memory critical', () => {
      expect(() => {
        validateResources(undefined, {
          minDiskSpaceGB: 0.1,
          minMemoryMB: 999999,
          warnDiskSpaceGB: 0.2,
          warnMemoryMB: 1000000,
        });
      }).toThrow(MemoryError);
    });
  });
});

describe('Model Resource Estimation', () => {
  describe('estimateModelSize', () => {
    it('should estimate small model sizes', () => {
      expect(estimateModelSize('minilm')).toBe(0.1);
      expect(estimateModelSize('text-embedding-3-small')).toBe(0.1);
    });

    it('should estimate base model sizes', () => {
      expect(estimateModelSize('mpnet-base')).toBe(0.5);
      expect(estimateModelSize('bert-base')).toBe(0.5);
    });

    it('should estimate large model sizes', () => {
      expect(estimateModelSize('model-large')).toBe(1.5);
      expect(estimateModelSize('gpt-xl')).toBe(1.5);
    });

    it('should estimate nomic model size', () => {
      expect(estimateModelSize('nomic-embed-text')).toBe(0.3);
    });

    it('should have default estimate', () => {
      expect(estimateModelSize('unknown-model')).toBe(0.5);
    });
  });

  describe('estimateMemoryRequirement', () => {
    it('should estimate memory for small models', () => {
      expect(estimateMemoryRequirement('minilm')).toBe(256);
      expect(estimateMemoryRequirement('small-model')).toBe(256);
    });

    it('should estimate memory for base models', () => {
      expect(estimateMemoryRequirement('bert-base')).toBe(512);
      expect(estimateMemoryRequirement('medium-model')).toBe(512);
    });

    it('should estimate memory for large models', () => {
      expect(estimateMemoryRequirement('model-large')).toBe(2048);
      expect(estimateMemoryRequirement('gpt-xl')).toBe(2048);
    });

    it('should estimate memory for nomic', () => {
      expect(estimateMemoryRequirement('nomic-embed')).toBe(768);
    });
  });

  describe('canLoadModel', () => {
    it('should check if can load small models', () => {
      const result = canLoadModel('minilm');

      expect(result).toHaveProperty('canLoad');
      expect(result).toHaveProperty('status');
      expect(typeof result.canLoad).toBe('boolean');

      // If cannot load, should have a reason
      if (!result.canLoad) {
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
      }
    });

    it('should provide reason if cannot load', () => {
      // Use impossibly large model to trigger failure
      const result = canLoadModel('impossibly-large-model-' + '9'.repeat(100));

      expect(result).toHaveProperty('reason');
      if (!result.canLoad) {
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
      }
    });

    it('should check both disk and memory', () => {
      const result = canLoadModel('test-model');

      expect(result.status.disk).toBeDefined();
      expect(result.status.memory).toBeDefined();
    });
  });
});

describe('Utility Functions', () => {
  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(100)).toBe('100 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should handle zero', () => {
      expect(formatBytes(0)).toBe('0 B');
    });
  });
});

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;

  beforeEach(() => {
    monitor = new ResourceMonitor(undefined, {
      minDiskSpaceGB: 1,
      minMemoryMB: 256,
      warnDiskSpaceGB: 2,
      warnMemoryMB: 512,
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  describe('Start/Stop', () => {
    it('should start monitoring', () => {
      expect(() => monitor.start(500)).not.toThrow();
    });

    it('should stop monitoring', () => {
      monitor.start(500);
      expect(() => monitor.stop()).not.toThrow();
    });

    it('should warn if already monitoring', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();

      monitor.start(500);
      monitor.start(500); // Second call

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Already monitoring')
      );

      consoleWarn.mockRestore();
    });
  });

  describe('Status Checking', () => {
    it('should return current status', () => {
      const status = monitor.getStatus();

      expect(status).toHaveProperty('disk');
      expect(status).toHaveProperty('memory');
      expect(status).toHaveProperty('timestamp');
    });

    it('should update status on check', () => {
      const status1 = monitor.check();
      const status2 = monitor.check();

      expect(status2.timestamp.getTime()).toBeGreaterThanOrEqual(
        status1.timestamp.getTime()
      );
    });
  });

  describe('Listeners', () => {
    it('should call listeners on status change', () => {
      const listener = jest.fn();
      monitor.onStatusChange(listener);

      monitor.check();

      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          disk: expect.any(Object),
          memory: expect.any(Object),
        })
      );
    });

    it('should handle multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      monitor.onStatusChange(listener1);
      monitor.onStatusChange(listener2);

      monitor.check();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      monitor.onStatusChange(errorListener);
      monitor.check();

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Listener error'),
        expect.any(Error)
      );

      consoleError.mockRestore();
    });
  });

  describe('Threshold Updates', () => {
    it('should update thresholds', () => {
      monitor.setThresholds({
        minDiskSpaceGB: 5,
        warnMemoryMB: 1024,
      });

      // Thresholds should be updated (check via status)
      const status = monitor.check();
      expect(status).toBeDefined();
    });
  });

  describe('Periodic Monitoring', () => {
    it('should check resources periodically', async () => {
      const listener = jest.fn();
      monitor.onStatusChange(listener);

      monitor.start(100); // Check every 100ms

      // Wait for multiple checks
      await new Promise(resolve => setTimeout(resolve, 350));

      expect(listener).toHaveBeenCalledTimes(4); // Initial + 3 periodic
    });
  });
});

describe('DEFAULT_THRESHOLDS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_THRESHOLDS.minDiskSpaceGB).toBe(2);
    expect(DEFAULT_THRESHOLDS.minMemoryMB).toBe(512);
    expect(DEFAULT_THRESHOLDS.warnDiskSpaceGB).toBe(5);
    expect(DEFAULT_THRESHOLDS.warnMemoryMB).toBe(1024);
  });
});
