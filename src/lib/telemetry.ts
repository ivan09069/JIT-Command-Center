// Pure telemetry shaping. Safe to import from client components.
// Collectors that touch the OS live in host-metrics.ts.

export type VolumeKind = 'fixed' | 'removable' | 'network' | 'cloud' | 'optical';

export interface Volume {
  mount: string;
  name: string;
  kind: VolumeKind;
  fileSystem: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface HostInfo {
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  uptimeSec: number;
  node: string;
}

export interface CpuInfo {
  model: string;
  cores: number;
  usagePercent: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface ProcessInfo {
  pid: number;
  uptimeSec: number;
  rss: number;
}

export type ProbeState = 'online' | 'degraded' | 'offline' | 'unconfigured';

export interface ProbeStatus {
  name: string;
  state: ProbeState;
  detail: string;
}

export type ThreatBand = 'low' | 'moderate' | 'elevated' | 'critical';
export type HealthOverall = 'GREEN' | 'YELLOW' | 'RED';

export interface ThreatAssessment {
  level: number;
  band: ThreatBand;
  reasons: string[];
  signature: string;
}

export interface HealthAssessment {
  overall: HealthOverall;
  reasons: string[];
}

export interface FeedItem {
  ts: number;
  severity: 'info' | 'warning' | 'critical';
  msg: string;
  signature: string;
}

export interface TelemetryReport {
  timestamp: number;
  host: HostInfo;
  cpu: CpuInfo;
  memory: MemoryInfo;
  volumes: Volume[];
  workspaceMount: string | null;
  volumeSource: 'cim' | 'statfs';
  volumeWarning?: string;
  primaryMount: string | null;
  adapters: ProbeStatus[];
  threat: ThreatAssessment;
  health: HealthAssessment;
  feed: FeedItem[];
  process: ProcessInfo;
}

interface LogicalDiskInput {
  DeviceID?: string;
  DriveType?: number | string;
  Size?: number | string | null;
  FreeSpace?: number | string | null;
  VolumeName?: string | null;
  FileSystem?: string | null;
}

const CALM_REASON = 'Watched resources are inside normal range';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function shortCpuModel(model: string): string {
  return model.replace(/\(R\)|\(TM\)/g, '').replace(/\s+/g, ' ').trim();
}

export function bandFromLevel(level: number): ThreatBand {
  if (level >= 80) return 'critical';
  if (level >= 60) return 'elevated';
  if (level >= 40) return 'moderate';
  return 'low';
}

export function healthFromLevel(level: number): HealthOverall {
  if (level >= 80) return 'RED';
  if (level >= 40) return 'YELLOW';
  return 'GREEN';
}

export function vercelDeploymentsUrl(projectId: string): string {
  return `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`;
}

function asFinite(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function kindFor(name: string, driveType: number | null): VolumeKind {
  if (/google drive|onedrive|dropbox/i.test(name)) return 'cloud';
  if (driveType === 2) return 'removable';
  if (driveType === 4) return 'network';
  if (driveType === 5) return 'optical';
  return 'fixed';
}

export function parseLogicalDisks(raw: unknown): Volume[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const volumes: Volume[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as LogicalDiskInput;
    const mount = String(row.DeviceID ?? '').trim().toUpperCase();
    if (!/^[A-Z]:$/.test(mount)) continue;

    const total = asFinite(row.Size);
    const freeRaw = asFinite(row.FreeSpace);
    if (total == null || total <= 0 || freeRaw == null || freeRaw < 0) continue;

    const free = Math.min(freeRaw, total);
    const used = Math.max(0, total - free);
    const name = String(row.VolumeName ?? '').trim();
    const driveType = asFinite(row.DriveType ?? null);
    const kind = kindFor(name, driveType);
    if (kind === 'optical') continue;

    volumes.push({
      mount,
      name,
      kind,
      fileSystem: String(row.FileSystem ?? '').trim(),
      total,
      used,
      free,
      percent: (used / total) * 100,
    });
  }

  return volumes.sort((a, b) => a.mount.localeCompare(b.mount));
}

export function volumeFromBlocks(
  mount: string,
  blocks: number,
  bsize: number,
  bfree: number,
  bavail: number,
  kind: VolumeKind,
  name = '',
  fileSystem = ''
): Volume | null {
  if (!Number.isFinite(blocks) || !Number.isFinite(bsize) || blocks <= 0 || bsize <= 0) return null;
  const total = blocks * bsize;
  const free = Math.max(0, Math.min(bavail * bsize, total));
  const used = Math.max(0, Math.min(total, total - bfree * bsize));
  return {
    mount,
    name,
    kind,
    fileSystem,
    total,
    used,
    free,
    percent: total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0,
  };
}

type PressureTier = 'ok' | 'elevated' | 'high' | 'critical';

function tier(percent: number, elevated: number, high: number, critical: number): PressureTier {
  if (percent >= critical) return 'critical';
  if (percent >= high) return 'high';
  if (percent >= elevated) return 'elevated';
  return 'ok';
}

function isWatched(volume: Volume, workspaceMount: string | null): boolean {
  if (volume.kind === 'cloud' || volume.kind === 'optical') return false;
  if (volume.kind === 'fixed') return true;
  return workspaceMount != null && volume.mount.toUpperCase() === workspaceMount.toUpperCase();
}

function diskPoints(percent: number, primary: boolean): number {
  if (percent >= 98) return primary ? 85 : 45;
  if (percent >= 95) return primary ? 80 : 40;
  if (percent >= 90) return primary ? 55 : 25;
  if (percent >= 85) return primary ? 40 : 20;
  if (percent >= 75) return primary ? 15 : 8;
  return 0;
}

function memoryPoints(percent: number): number {
  if (percent >= 95) return 85;
  if (percent >= 90) return 60;
  if (percent >= 85) return 45;
  if (percent >= 75) return 20;
  return 0;
}

function cpuPoints(percent: number | null): number {
  if (percent == null) return 0;
  if (percent >= 95) return 85;
  if (percent >= 85) return 45;
  return 0;
}

function volumeLabel(volume: Volume): string {
  return volume.name ? `${volume.mount} ${volume.name}` : volume.mount;
}

export function assessPressure(input: {
  volumes: Volume[];
  workspaceMount: string | null;
  memoryPercent: number;
  cpuPercent: number | null;
}): { primary: Volume | null; threat: ThreatAssessment; health: HealthAssessment } {
  const watched = input.volumes.filter((volume) => isWatched(volume, input.workspaceMount));
  const byPressure = [...watched].sort((a, b) => b.percent - a.percent || a.mount.localeCompare(b.mount));
  const primary = byPressure[0] ?? null;

  let score = 0;
  const reasons: string[] = [];
  const codes: string[] = [];

  byPressure.forEach((volume, index) => {
    const diskTier = tier(volume.percent, 75, 85, 95);
    score += diskPoints(volume.percent, index === 0);
    if (diskTier === 'ok') return;
    codes.push(`disk ${volume.mount} ${diskTier}`);
    const label = volumeLabel(volume);
    const pct = volume.percent.toFixed(1);
    if (diskTier === 'critical') {
      reasons.push(`${label} critically full (${pct}%, ${formatBytes(volume.free)} free)`);
    } else if (diskTier === 'high') {
      reasons.push(`${label} nearly full (${pct}%, ${formatBytes(volume.free)} free)`);
    } else {
      reasons.push(`${label} filling up (${pct}% used)`);
    }
  });

  const memTier = tier(input.memoryPercent, 75, 85, 95);
  score += memoryPoints(input.memoryPercent);
  if (memTier !== 'ok') {
    codes.push(`mem:${memTier}`);
    const used = `${input.memoryPercent.toFixed(1)}% used`;
    reasons.push(
      memTier === 'critical'
        ? `Memory critically high (${used})`
        : memTier === 'high'
          ? `Memory above 85% (${used})`
          : `Memory elevated (${used})`
    );
  }

  const cpuTier = input.cpuPercent == null ? 'ok' : tier(input.cpuPercent, 101, 85, 95);
  score += cpuPoints(input.cpuPercent);
  if (cpuTier !== 'ok' && input.cpuPercent != null) {
    codes.push(`cpu:${cpuTier}`);
    reasons.push(
      cpuTier === 'critical'
        ? `CPU critically busy (${input.cpuPercent.toFixed(1)}%)`
        : `CPU above 85% (${input.cpuPercent.toFixed(1)}% busy)`
    );
  }

  const level = Math.max(0, Math.min(100, Math.round(score)));
  const band = bandFromLevel(level);
  const signature = codes.length > 0 ? codes.join('|') : 'ok';
  const threat: ThreatAssessment = { level, band, reasons, signature };
  const health: HealthAssessment = {
    overall: healthFromLevel(level),
    reasons: reasons.length > 0 ? reasons : [CALM_REASON],
  };

  return { primary, threat, health };
}

export function nextFeed(prev: FeedItem[], health: HealthAssessment, threat: ThreatAssessment): FeedItem[] {
  const last = prev[prev.length - 1];
  if (last?.signature === threat.signature) return prev;
  const msg = threat.reasons.length > 0
    ? `${health.overall}: ${threat.reasons.join(' · ')}`
    : `${health.overall}: ${CALM_REASON}`;
  const severity: FeedItem['severity'] = health.overall === 'RED'
    ? 'critical'
    : health.overall === 'YELLOW'
      ? 'warning'
      : 'info';
  return [...prev, { ts: Date.now(), severity, msg, signature: threat.signature }].slice(-8);
}
