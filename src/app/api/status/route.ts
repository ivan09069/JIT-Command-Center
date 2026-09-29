import { probeCloudAdapters } from '@/lib/cloud-probes';
import { gate } from '@/lib/gate';
import { collectHostTelemetry } from '@/lib/host-metrics';
import { assessPressure, nextFeed, type FeedItem, type TelemetryReport } from '@/lib/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let feed: FeedItem[] = [];

export async function GET() {
  try {
    const raw = await collectHostTelemetry();
    const pressure = assessPressure({
      volumes: raw.volumes,
      workspaceMount: raw.workspaceMount,
      memoryPercent: raw.memory.percent,
      cpuPercent: raw.cpu.usagePercent,
    });
    feed = nextFeed(feed, pressure.health, pressure.threat);
    const cloud = await probeCloudAdapters();
    const volumeCount = raw.volumes.length;

    const body: TelemetryReport = {
      timestamp: Date.now(),
      host: raw.host,
      cpu: raw.cpu,
      memory: raw.memory,
      volumes: raw.volumes,
      workspaceMount: raw.workspaceMount,
      volumeSource: raw.volumeSource,
      volumeWarning: raw.volumeWarning,
      primaryMount: pressure.primary?.mount ?? null,
      adapters: [
        {
          name: 'Host',
          state: volumeCount > 0 ? 'online' : 'degraded',
          detail: volumeCount > 0
            ? `${raw.host.hostname} · ${volumeCount} volume${volumeCount === 1 ? '' : 's'}`
            : 'No volumes reported',
        },
        ...cloud,
      ],
      threat: pressure.threat,
      health: pressure.health,
      feed,
      process: raw.process,
    };

    gate.syncTelemetry({
      diskUsage: pressure.primary?.percent ?? 0,
      threatLevel: pressure.threat.level,
    });

    return Response.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Telemetry read failed';
    return Response.json(
      { timestamp: Date.now(), error: message.slice(0, 200) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
