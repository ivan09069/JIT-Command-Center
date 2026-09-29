'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  formatBytes,
  formatUptime,
  shortCpuModel,
  type ProbeState,
  type TelemetryReport,
  type Volume,
} from '@/lib/telemetry';

async function fetcher(url: string): Promise<TelemetryReport> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Status ${res.status}`);
  }
  return body as TelemetryReport;
}

function toneClass(percent: number): string {
  if (percent >= 90) return 'tone-crit';
  if (percent >= 75) return 'tone-warn';
  return 'tone-ok';
}

function toneColor(percent: number): string {
  if (percent >= 90) return 'var(--hud-red)';
  if (percent >= 75) return 'var(--hud-amber)';
  return 'var(--hud-cyan)';
}

function healthLabel(overall: TelemetryReport['health']['overall'] | null): string {
  if (overall === 'RED') return 'SYS CRITICAL';
  if (overall === 'YELLOW') return 'SYS DEGRADED';
  if (overall === 'GREEN') return 'SYS ONLINE';
  return 'SYS SAMPLING';
}

function probeClass(state: ProbeState): string {
  if (state === 'online') return 'tone-live';
  if (state === 'degraded') return 'tone-warn';
  if (state === 'offline') return 'tone-crit';
  return 'tone-muted';
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span>--:--:--</span>;
  return <span>{now.toLocaleTimeString()} · {now.toLocaleDateString()}</span>;
}

function SampleAge({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  return <span>{seconds}s ago</span>;
}

function Meter({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number;
  detail: string;
}) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="hud-meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(width.toFixed(1))}
    >
      <div className="hud-meter-label">
        <span>{label}</span>
        <span className={toneClass(width)}>{width.toFixed(1)}%</span>
      </div>
      <div className="hud-meter-track">
        <div className="hud-meter-fill" style={{ width: `${width}%`, background: toneColor(width) }} />
      </div>
      <div className="hud-meter-detail">{detail}</div>
    </div>
  );
}

function VolumeRow({ volume, workspace, primary }: { volume: Volume; workspace: boolean; primary: boolean }) {
  const width = Math.max(0, Math.min(100, volume.percent));
  const tags = [
    volume.kind,
    volume.fileSystem,
    workspace ? 'workspace' : '',
    primary ? 'watched' : '',
  ].filter(Boolean).join(' · ');
  return (
    <div className="hud-volume" data-mount={volume.mount}>
      <div className="hud-volume-top">
        <span>{volume.name ? `${volume.mount} ${volume.name}` : volume.mount}</span>
        <span className={toneClass(width)}>{width.toFixed(1)}%</span>
      </div>
      <div className="hud-volume-track" aria-hidden="true">
        <div className="hud-volume-fill" style={{ width: `${width}%`, background: toneColor(width) }} />
      </div>
      <div className="hud-volume-meta">
        {formatBytes(volume.used)} used · {formatBytes(volume.free)} free · {formatBytes(volume.total)}
        {tags ? ` · ${tags}` : ''}
      </div>
    </div>
  );
}

export default function InfrastructureHUD() {
  const { data, error, isValidating } = useSWR('/api/status', fetcher, {
    refreshInterval: 3000,
    dedupingInterval: 1500,
    revalidateOnFocus: true,
  });

  const band = data?.threat.band ?? 'low';
  const primary = data?.volumes.find((volume) => volume.mount === data.primaryMount) ?? null;
  const link = error ? 'OFFLINE' : data ? 'LIVE' : 'SAMPLING';
  const linkClass = error ? 'tone-crit' : data ? 'tone-live' : 'tone-warn';

  return (
    <div className="hud-stage" data-threat={data ? band : 'low'} data-testid="hud-stage">
      <header className="hud-header">
        <div
          className={`hud-chip ${data ? (data.health.overall === 'GREEN' ? 'tone-live' : data.health.overall === 'YELLOW' ? 'tone-warn' : 'tone-crit') : 'tone-warn'}`}
          data-testid="health-chip"
        >
          {error && !data ? 'SYS OFFLINE' : healthLabel(data?.health.overall ?? null)}
        </div>
        <div className="hud-title">EchoForge Command Center</div>
        <div className="hud-chip" data-testid="hostname">
          {data?.host.hostname ?? 'LOCAL HOST'}
        </div>
      </header>

      <main className="hud-main mx-auto max-w-7xl">
        <section className="hud-panel min-w-0" data-testid="storage-panel">
          <div className="hud-corners"><span /><span /><span /><span /></div>
          <div className="hud-panel-title">
            <span>▸ Storage</span>
            <span className={primary ? toneClass(primary.percent) : 'tone-warn'} data-testid="disk-state">
              {primary ? (primary.percent >= 95 ? 'DISK: CRIT' : primary.percent >= 85 ? 'DISK: WARN' : 'DISK: OK') : 'DISK: —'}
            </span>
          </div>

          {primary ? (
            <div
              className="arc-core"
              style={{ ['--used' as string]: String(primary.percent), ['--arc-color' as string]: toneColor(primary.percent) }}
            >
              <div className="arc-core-inner">
                <div className="text-center">
                  <div className={`arc-core-value ${toneClass(primary.percent)}`} data-testid="disk-percent">
                    {primary.percent.toFixed(1)}%
                  </div>
                  <div className="arc-core-sub">
                    {primary.mount}{primary.name ? ` · ${primary.name}` : ''}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="hud-reason" data-testid="disk-percent">{error ? 'No disk sample.' : 'Reading disks…'}</p>
          )}

          {data && (
            <div data-testid="volume-list">
              {data.volumes.map((volume) => (
                <VolumeRow
                  key={volume.mount}
                  volume={volume}
                  workspace={volume.mount === data.workspaceMount}
                  primary={volume.mount === data.primaryMount}
                />
              ))}
              <p className="hud-volume-meta">
                Source {data.volumeSource}
                {data.workspaceMount ? ` · workspace ${data.workspaceMount}` : ''}
              </p>
              {data.volumeWarning && <p className="hud-warning">{data.volumeWarning}</p>}
            </div>
          )}
        </section>

        <section className="hud-panel min-w-0" data-testid="compute-panel">
          <div className="hud-corners"><span /><span /><span /><span /></div>
          <div className="hud-panel-title">
            <span>▸ Compute</span>
            <span className="tone-ok">{data ? `${data.cpu.cores} cores` : '—'}</span>
          </div>

          {data ? (
            <>
              <Meter
                label="CPU"
                percent={data.cpu.usagePercent}
                detail={shortCpuModel(data.cpu.model)}
              />
              <div data-testid="cpu-percent" hidden>{data.cpu.usagePercent.toFixed(1)}</div>
              <Meter
                label="Memory"
                percent={data.memory.percent}
                detail={`${formatBytes(data.memory.used)} used · ${formatBytes(data.memory.free)} free · ${formatBytes(data.memory.total)}`}
              />
              <div data-testid="memory-percent" hidden>{data.memory.percent.toFixed(1)}</div>
              <dl className="hud-facts">
                <dt>host</dt><dd>{data.host.hostname}</dd>
                <dt>os</dt><dd>{data.host.platform} {data.host.release} · {data.host.arch}</dd>
                <dt>up</dt><dd>{formatUptime(data.host.uptimeSec)}</dd>
                <dt>node</dt><dd>{data.host.node}</dd>
                <dt>proc</dt><dd>pid {data.process.pid} · rss {formatBytes(data.process.rss)} · up {formatUptime(data.process.uptimeSec)}</dd>
              </dl>
            </>
          ) : (
            <p className="hud-reason">{error ? 'Compute sample unavailable.' : 'Sampling CPU and memory…'}</p>
          )}
        </section>

        <section className="hud-panel min-w-0" data-testid="posture-panel">
          <div className="hud-corners"><span /><span /><span /><span /></div>
          <div className="hud-panel-title">
            <span>▸ Posture</span>
            <span className={data ? toneClass(data.threat.level) : 'tone-warn'} data-testid="threat-level">
              {data ? `${data.threat.level} / 100` : '—'}
            </span>
          </div>

          {error && !data && (
            <p className="hud-warning" data-testid="status-error">
              Telemetry unavailable. {error instanceof Error ? error.message : 'The status API did not respond.'}
            </p>
          )}

          {data && (
            <>
              <div className={`text-3xl font-bold mt-2 ${toneClass(data.threat.level)}`}>
                {data.threat.band.toUpperCase()}
              </div>
              <p className="hud-volume-meta">Derived from this machine&apos;s disks, memory, and CPU.</p>
              <div data-testid="reasons">
                {data.health.reasons.map((reason) => (
                  <p className="hud-reason" key={reason}>{reason}</p>
                ))}
              </div>

              <div className="hud-kicker">Adapters</div>
              <div data-testid="adapters">
                {data.adapters.map((adapter) => (
                  <div className="hud-volume" key={adapter.name}>
                    <div className="hud-volume-top">
                      <span>{adapter.name}</span>
                      <span className={probeClass(adapter.state)}>{adapter.state.toUpperCase()}</span>
                    </div>
                    <div className="hud-volume-meta">{adapter.detail}</div>
                  </div>
                ))}
              </div>

              <div className="hud-kicker">Changes</div>
              <ul className="hud-feed" data-testid="feed">
                {data.feed.length === 0 && <li>Waiting for the first sample.</li>}
                {data.feed.map((item) => (
                  <li key={`${item.ts}-${item.signature}`}>
                    <span className={item.severity === 'critical' ? 'tone-crit' : item.severity === 'warning' ? 'tone-warn' : 'tone-live'}>
                      {new Date(item.ts).toLocaleTimeString()}
                    </span>
                    {' · '}
                    {item.msg}
                  </li>
                ))}
              </ul>
              <p className="hud-volume-meta">Remote deploy controls stay off unless JIT_ALLOW_REMOTE_CONTROL=1.</p>
            </>
          )}
        </section>
      </main>

      <div className="hud-status-bar" data-testid="status-bar">
        <div className="hud-status-row">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="hud-status-indicator">
              <div className="hud-status-dot" style={{ background: error ? 'var(--hud-red)' : 'var(--hud-green)' }} />
              <span className={linkClass} data-testid="link-state">{link}{isValidating && data ? ' · SYNC' : ''}</span>
            </div>
            <div className="hud-status-indicator">
              <div className="hud-status-dot" style={{ background: 'var(--hud-cyan)' }} />
              <span className="tone-ok">
                {data ? `THREAT ${data.threat.band.toUpperCase()}` : 'THREAT —'}
              </span>
            </div>
            <div className="hud-status-indicator">
              <span className="tone-muted">
                {data ? <SampleAge timestamp={data.timestamp} /> : 'no sample'}
              </span>
            </div>
          </div>
          <div className="opacity-70"><Clock /></div>
        </div>
      </div>
    </div>
  );
}
