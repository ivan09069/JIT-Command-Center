import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessPressure,
  bandFromLevel,
  formatBytes,
  formatUptime,
  healthFromLevel,
  nextFeed,
  parseLogicalDisks,
  shortCpuModel,
  vercelDeploymentsUrl,
} from './telemetry';

const GiB = 1024 ** 3;

describe('formatters', () => {
  it('formats bytes and uptime without inventing units', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1536), '1.50 KB');
    assert.equal(formatBytes(2.13 * GiB), '2.13 GB');
    assert.equal(formatUptime(90), '1m 30s');
    assert.equal(formatUptime(3 * 3600 + 5 * 60), '3h 5m');
    assert.equal(shortCpuModel('Intel(R) Core(TM) i7'), 'Intel Core i7');
  });

  it('maps threat bands at the HUD thresholds', () => {
    assert.equal(bandFromLevel(0), 'low');
    assert.equal(bandFromLevel(39), 'low');
    assert.equal(bandFromLevel(40), 'moderate');
    assert.equal(bandFromLevel(59), 'moderate');
    assert.equal(bandFromLevel(60), 'elevated');
    assert.equal(bandFromLevel(79), 'elevated');
    assert.equal(bandFromLevel(80), 'critical');
    assert.equal(bandFromLevel(100), 'critical');
    assert.equal(healthFromLevel(39), 'GREEN');
    assert.equal(healthFromLevel(40), 'YELLOW');
    assert.equal(healthFromLevel(80), 'RED');
  });
});

describe('parseLogicalDisks', () => {
  it('classifies fixed, removable, and cloud volumes and skips optical media', () => {
    const volumes = parseLogicalDisks([
      { DeviceID: 'C:', DriveType: 3, Size: 1000, FreeSpace: 400, VolumeName: 'System', FileSystem: 'NTFS' },
      { DeviceID: 'G:', DriveType: 3, Size: 1000, FreeSpace: 10, VolumeName: 'Google Drive', FileSystem: 'FAT32' },
      { DeviceID: 'E:', DriveType: 2, Size: 500, FreeSpace: 100, VolumeName: 'USB', FileSystem: 'FAT32' },
      { DeviceID: 'F:', DriveType: 5, Size: 100, FreeSpace: 0, VolumeName: 'DVD', FileSystem: 'UDF' },
      { DeviceID: 'Z:', DriveType: 3, Size: null, FreeSpace: 0, VolumeName: '', FileSystem: '' },
    ]);

    assert.deepEqual(volumes.map((volume) => volume.mount), ['C:', 'E:', 'G:']);
    assert.equal(volumes.find((volume) => volume.mount === 'G:')?.kind, 'cloud');
    assert.equal(volumes.find((volume) => volume.mount === 'E:')?.kind, 'removable');
    assert.equal(volumes.find((volume) => volume.mount === 'C:')?.percent, 60);
  });

  it('accepts a single CIM object', () => {
    const volumes = parseLogicalDisks({
      DeviceID: 'C:',
      DriveType: 3,
      Size: 200,
      FreeSpace: 50,
      VolumeName: 'Acre',
      FileSystem: 'NTFS',
    });
    assert.equal(volumes.length, 1);
    assert.equal(volumes[0].percent, 75);
    assert.equal(volumes[0].name, 'Acre');
  });
});

describe('assessPressure', () => {
  it('stays calm when watched resources are comfortable', () => {
    const volumes = parseLogicalDisks([
      { DeviceID: 'C:', DriveType: 3, Size: 1000, FreeSpace: 600, VolumeName: 'System', FileSystem: 'NTFS' },
    ]);
    const report = assessPressure({
      volumes,
      workspaceMount: 'C:',
      memoryPercent: 42,
      cpuPercent: 8,
    });
    assert.equal(report.threat.level, 0);
    assert.equal(report.threat.band, 'low');
    assert.equal(report.health.overall, 'GREEN');
    assert.equal(report.threat.signature, 'ok');
    assert.match(report.health.reasons[0], /normal range/);
  });

  it('raises a critical posture from the system and workspace volumes, not from cloud mirrors', () => {
    const volumes = parseLogicalDisks([
      { DeviceID: 'C:', DriveType: 3, Size: 118 * GiB, FreeSpace: 0.8 * GiB, VolumeName: 'Sys', FileSystem: 'NTFS' },
      { DeviceID: 'D:', DriveType: 2, Size: 114 * GiB, FreeSpace: 2 * GiB, VolumeName: '', FileSystem: 'exFAT' },
      { DeviceID: 'G:', DriveType: 3, Size: 118 * GiB, FreeSpace: 0.7 * GiB, VolumeName: 'Google Drive', FileSystem: 'FAT32' },
    ]);
    const report = assessPressure({
      volumes,
      workspaceMount: 'D:',
      memoryPercent: 88,
      cpuPercent: 4,
    });

    assert.equal(report.primary?.mount, 'C:');
    assert.equal(report.health.overall, 'RED');
    assert.equal(report.threat.band, 'critical');
    assert.ok(report.threat.level >= 80);
    assert.ok(report.threat.reasons.some((reason) => reason.startsWith('C:')));
    assert.ok(report.threat.reasons.some((reason) => reason.startsWith('D:')));
    assert.equal(report.threat.reasons.some((reason) => reason.startsWith('G:')), false);
    assert.match(report.threat.reasons.join(' '), /Memory above 85%/);
  });

  it('turns yellow on memory pressure even when disks are fine', () => {
    const volumes = parseLogicalDisks([
      { DeviceID: 'C:', DriveType: 3, Size: 1000, FreeSpace: 600, VolumeName: 'System', FileSystem: 'NTFS' },
    ]);
    const report = assessPressure({
      volumes,
      workspaceMount: 'C:',
      memoryPercent: 88,
      cpuPercent: 10,
    });
    assert.equal(report.health.overall, 'YELLOW');
    assert.equal(report.threat.band, 'moderate');
    assert.ok(report.threat.reasons.some((reason) => reason.startsWith('Memory')));
    assert.equal(report.threat.reasons.some((reason) => reason.startsWith('C:')), false);
  });
});

describe('feed and cloud url', () => {
  it('appends a feed entry only when the pressure signature changes', () => {
    const volumes = parseLogicalDisks([
      { DeviceID: 'C:', DriveType: 3, Size: 1000, FreeSpace: 600, VolumeName: 'System', FileSystem: 'NTFS' },
    ]);
    const calm = assessPressure({ volumes, workspaceMount: 'C:', memoryPercent: 20, cpuPercent: 5 });
    const once = nextFeed([], calm.health, calm.threat);
    const twice = nextFeed(once, calm.health, calm.threat);
    assert.equal(twice.length, 1);
    assert.equal(twice[0].severity, 'info');

    const hot = assessPressure({ volumes, workspaceMount: 'C:', memoryPercent: 96, cpuPercent: 5 });
    const third = nextFeed(twice, hot.health, hot.threat);
    assert.equal(third.length, 2);
    assert.equal(third[1].severity, 'critical');
    assert.notEqual(third[1].signature, twice[0].signature);
  });

  it('builds a real Vercel deployments URL', () => {
    const url = vercelDeploymentsUrl('prj_123');
    assert.match(url, /projectId=prj_123/);
    assert.equal(url.includes('{projectId}'), false);
    assert.equal(url.includes('{token}'), false);
  });
});
