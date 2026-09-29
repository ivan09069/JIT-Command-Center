import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { collectHostTelemetry, resetHostMetricCache } from './host-metrics';
import { assessPressure, bandFromLevel, healthFromLevel } from './telemetry';

const FAKE_TOTAL = 1000 * 1024 * 1024 * 1024;

describe('collectHostTelemetry', () => {
  it('reads this machine instead of the static 99.5% / 1000 GiB disk figure', { timeout: 20_000 }, async () => {
    resetHostMetricCache();
    const raw = await collectHostTelemetry();
    const second = await collectHostTelemetry();

    assert.ok(raw.volumes.length >= 1);
    assert.equal(raw.host.hostname, os.hostname());
    assert.ok(raw.cpu.cores >= 1);
    assert.ok(raw.cpu.usagePercent >= 0 && raw.cpu.usagePercent <= 100);
    assert.ok(second.cpu.usagePercent >= 0 && second.cpu.usagePercent <= 100);
    assert.ok(Math.abs(raw.memory.total - os.totalmem()) / os.totalmem() < 0.05);
    assert.ok(raw.memory.percent >= 0 && raw.memory.percent <= 100);
    assert.notEqual(raw.workspaceMount, '/data/data/com.termux');

    for (const volume of raw.volumes) {
      assert.ok(volume.total > 0);
      assert.ok(volume.percent >= 0 && volume.percent <= 100);
      assert.ok(Math.abs(volume.used + volume.free - volume.total) / volume.total < 0.02);
      assert.equal(volume.mount.includes('termux'), false);
      const isFakeDisk = volume.total === FAKE_TOTAL && Math.abs(volume.percent - 99.5) < 0.01;
      assert.equal(isFakeDisk, false);
    }

    if (process.platform === 'win32') {
      assert.ok(raw.volumes.some((volume) => volume.mount === 'C:'));
      assert.equal(raw.workspaceMount, process.cwd().slice(0, 2).toUpperCase());
      assert.equal(raw.volumeSource, 'cim');
    }

    const assessment = assessPressure({
      volumes: raw.volumes,
      workspaceMount: raw.workspaceMount,
      memoryPercent: raw.memory.percent,
      cpuPercent: raw.cpu.usagePercent,
    });
    assert.equal(assessment.threat.band, bandFromLevel(assessment.threat.level));
    assert.equal(assessment.health.overall, healthFromLevel(assessment.threat.level));
    assert.ok(assessment.threat.level >= 0 && assessment.threat.level <= 100);
  });
});
