import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';
import {
  parseLogicalDisks,
  volumeFromBlocks,
  type CpuInfo,
  type HostInfo,
  type MemoryInfo,
  type ProcessInfo,
  type Volume,
} from './telemetry';

const execFileAsync = promisify(execFile);

export interface HostSnapshot {
  host: HostInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  volumes: Volume[];
  workspaceMount: string | null;
  volumeSource: 'cim' | 'statfs';
  volumeWarning?: string;
  process: ProcessInfo;
}

interface CpuTimes {
  idle: number;
  total: number;
}

let previousCpu: CpuTimes | null = null;
let volumeCache: { at: number; volumes: Volume[]; source: 'cim' | 'statfs'; warning?: string } | null = null;

const VOLUME_CACHE_MS = 4000;

function readCpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

function usageBetween(before: CpuTimes, after: CpuTimes): number {
  const totalDelta = after.total - before.total;
  const idleDelta = after.idle - before.idle;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

export async function readCpuUsage(): Promise<CpuInfo> {
  const cpus = os.cpus();
  const model = cpus[0]?.model ?? 'unknown';
  const cores = cpus.length;
  const first = readCpuTimes();
  const baseline = previousCpu;
  previousCpu = first;

  if (baseline && first.total > baseline.total) {
    return { model, cores, usagePercent: usageBetween(baseline, first) };
  }

  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = readCpuTimes();
  previousCpu = second;
  return { model, cores, usagePercent: usageBetween(first, second) };
}

export function readMemory(): MemoryInfo {
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return {
    total,
    used,
    free,
    percent: total > 0 ? (used / total) * 100 : 0,
  };
}

export function workspaceMount(): string | null {
  if (process.platform === 'win32') {
    const match = process.cwd().match(/^([A-Za-z]:)/);
    return match ? match[1].toUpperCase() : null;
  }
  return '/';
}

function decodeProcessOutput(stdout: string | Buffer): string {
  const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le');
  }
  if (buf.length >= 4 && buf[1] === 0 && buf[3] === 0) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

async function queryWindowsDisks(): Promise<Volume[]> {
  const command = [
    "$ProgressPreference='SilentlyContinue'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "Get-CimInstance -ClassName Win32_LogicalDisk | Select-Object DeviceID, DriveType, Size, FreeSpace, VolumeName, FileSystem | ConvertTo-Json -Compress",
  ].join('; ');

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { timeout: 12000, windowsHide: true, encoding: 'buffer', maxBuffer: 1024 * 1024 }
  );

  const text = decodeProcessOutput(stdout).trim();
  if (!text) return [];
  return parseLogicalDisks(JSON.parse(text));
}

function statfsMount(mountPath: string, kind: Volume['kind']): Volume | null {
  try {
    const stats = fs.statfsSync(mountPath);
    const label = mountPath === '/' ? '/' : mountPath.replace(/[\\/]+$/, '').toUpperCase();
    return volumeFromBlocks(
      label,
      Number(stats.blocks),
      Number(stats.bsize),
      Number(stats.bfree),
      Number(stats.bavail),
      kind
    );
  } catch {
    return null;
  }
}

function statfsFallback(): Volume[] {
  const paths = process.platform === 'win32'
    ? Array.from(new Set(['C:\\', workspaceMount() ? `${workspaceMount()}\\` : 'C:\\']))
    : ['/'];
  const kind = process.platform === 'win32' ? 'fixed' : 'fixed';
  return paths
    .map((mountPath) => statfsMount(mountPath, kind))
    .filter((volume): volume is Volume => volume != null);
}

async function readVolumes(): Promise<{ volumes: Volume[]; source: 'cim' | 'statfs'; warning?: string }> {
  if (volumeCache && Date.now() - volumeCache.at < VOLUME_CACHE_MS) {
    return volumeCache;
  }

  let volumes: Volume[] = [];
  let source: 'cim' | 'statfs' = 'statfs';
  let warning: string | undefined;

  if (process.platform === 'win32') {
    try {
      volumes = await queryWindowsDisks();
      if (volumes.length > 0) {
        source = 'cim';
      } else {
        warning = 'Disk inventory returned no volumes; used statfs instead';
        volumes = statfsFallback();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Disk inventory failed';
      warning = `${message}. Used statfs instead`.slice(0, 180);
      volumes = statfsFallback();
    }
  } else {
    volumes = statfsFallback();
  }

  volumeCache = { at: Date.now(), volumes, source, warning };
  return volumeCache;
}

export async function collectHostTelemetry(): Promise<HostSnapshot> {
  const [cpu, volumeResult] = await Promise.all([readCpuUsage(), readVolumes()]);
  return {
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptimeSec: os.uptime(),
      node: process.version,
    },
    cpu,
    memory: readMemory(),
    volumes: volumeResult.volumes,
    workspaceMount: workspaceMount(),
    volumeSource: volumeResult.source,
    volumeWarning: volumeResult.warning,
    process: {
      pid: process.pid,
      uptimeSec: process.uptime(),
      rss: process.memoryUsage().rss,
    },
  };
}

export function resetHostMetricCache(): void {
  previousCpu = null;
  volumeCache = null;
}
