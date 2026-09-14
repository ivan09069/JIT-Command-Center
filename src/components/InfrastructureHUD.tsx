'use client';

import { useEffect, useState } from 'react';

export default function InfrastructureHUD() {
  const [threatLevel, setThreatLevel] = useState(70);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div 
      className="hud-stage"
      data-threat={
        threatLevel >= 80 ? 'critical' :
        threatLevel >= 60 ? 'elevated' : 
        threatLevel >= 40 ? 'moderate' : 
        'low'
      }
    >
      {/* Header */}
      <header className="hud-header">
        <div className="hud-chip" style={{ color: 'var(--hud-green)' }}>
          PREVIEW
        </div>
        <div className="hud-title">
          ECHOFORGE COMMAND CENTER
        </div>
        <div className="hud-chip" style={{ color: 'var(--hud-green)' }}>
          DEMO DATA
        </div>
      </header>

      {/* Main Grid */}
      <main className="mx-auto max-w-6xl px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Telemetry Core */}
        <section className="hud-panel">
          <div className="hud-corners">
            <span/><span/><span/><span/>
          </div>

          <div className="hud-panel-title">
            <span>▸ Telemetry Core</span>
            <span style={{ color: 'var(--hud-amber)' }}>DISK: UNKNOWN</span>
          </div>

          <div className="arc-core">
            <div className="arc-core-inner">
              <div className="text-center">
                <div className="arc-core-value" style={{ color: 'var(--hud-cyan)' }}>
                  Unknown
                </div>
                <div className="arc-core-sub" style={{ color: 'var(--hud-cyan)' }}>
                  ARC-CORE STABILITY
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="opacity-70">• usedPct:</span>
              <span style={{ color: 'var(--hud-cyan)' }}>Unknown</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">• freeGb:</span>
              <span style={{ color: 'var(--hud-cyan)' }}>Not connected</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="opacity-70">• mount:</span>
              <span style={{ color: 'var(--hud-cyan)' }}>Not connected</span>
            </div>
          </div>
        </section>

        {/* Threat Level */}
        <section className="hud-panel hud-focused">
          <div className="hud-corners">
            <span/><span/><span/><span/>
          </div>

          <div className="hud-panel-title">
            <span>▸ Threat Level</span>
            <span style={{ color: 'var(--hud-amber)' }}>{threatLevel} / 100</span>
          </div>

          <div className="mt-6">
            <div className="relative h-10 bg-black/40 rounded-lg overflow-hidden border border-purple-500/20">
              <div 
                className="absolute top-0 left-0 h-full transition-all duration-500"
                style={{
                  width: `${threatLevel}%`,
                  background: 'linear-gradient(90deg, var(--hud-green) 0%, var(--hud-amber) 50%, var(--hud-red) 100%)'
                }}
              />
              <div 
                className="absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2"
                style={{ 
                  left: `${threatLevel}%`, 
                  marginLeft: '-8px',
                  borderColor: 'var(--hud-bg)',
                  boxShadow: 'var(--glow)'
                }}
              />
            </div>

            <div className="text-right mt-3 text-3xl font-bold" style={{ color: 'var(--hud-amber)' }}>
              {threatLevel}%
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="hud-chip" style={{ borderColor: 'rgba(255,176,32,.55)', color: 'var(--hud-amber)' }}>
                WARN @ 60%
              </div>
              <div className="hud-chip" style={{ borderColor: 'rgba(255,61,110,.55)', color: 'var(--hud-red)' }}>
                CRIT @ 80%
              </div>
            </div>

            <p className="text-center text-sm opacity-70 mt-4">
              Higher = more sensitive alerts.
            </p>
          </div>
        </section>

        {/* HUD Notes */}
        <section className="hud-panel">
          <div className="hud-corners">
            <span/><span/><span/><span/>
          </div>

          <div className="hud-panel-title">
            <span>▸ EchoForge HUD Notes</span>
          </div>

          <div className="font-mono text-sm leading-6" style={{ color: 'var(--hud-green)' }}>
            We can borrow CRT<br/>
            scanlines + glitch effects<br/>
            from your Whale Matrix<br/>
            project.
          </div>
        </section>
      </main>

      {/* Bottom Status Bar */}
      <div className="hud-status-bar">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-8">
            <div className="hud-status-indicator">
              <div className="hud-status-dot" style={{ background: 'var(--hud-green)' }} />
              <span style={{ color: 'var(--hud-green)' }}>LIVE</span>
            </div>
            <div className="hud-status-indicator">
              <div className="hud-status-dot" style={{ background: 'var(--hud-cyan)' }} />
              <span style={{ color: 'var(--hud-cyan)' }}>SECURE</span>
            </div>
            <div className="hud-status-indicator">
              <div className="hud-status-dot" style={{ background: 'var(--hud-amber)' }} />
              <span style={{ color: 'var(--hud-amber)' }}>THREAT: MODERATE</span>
            </div>
          </div>

          <div className="opacity-50">
            {currentTime.toLocaleTimeString()} | {currentTime.toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
