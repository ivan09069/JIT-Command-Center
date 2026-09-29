// lib/blackbox.ts - Append-only incident logger (Black Box)
// 
// PERSISTENCE SCOPE (v3.0):
// - Storage: localStorage (browser-local only)
// - Survives: Page refresh, tab close/reopen
// - Does NOT survive: Browser cache clear, device loss, browser uninstall
// - Max size: 10,000 incidents (auto-trim)
// 
// FUTURE (v3.1+):
// - Mirror to IndexedDB for larger capacity
// - Optional export to signed JSON (cold storage)
// - Optional forward to remote append-only log

export interface Incident {
  id: string;
  ts: number;
  msg: string;
  category: 'deployment' | 'security' | 'system' | 'agent';
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}

class BlackBox {
  private storageKey = 'jit_blackbox_incidents';
  private maxSize = 10000;
  private incidents: Incident[] = [];

  constructor() {
    this.load();
  }

  append(incident: Omit<Incident, 'id' | 'ts'>): Incident {
    const entry: Incident = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ts: Date.now(),
      ...incident
    };

    this.incidents.push(entry);
    
    // Trim if exceeds max size
    if (this.incidents.length > this.maxSize) {
      this.incidents = this.incidents.slice(-this.maxSize);
    }

    this.persist();
    return entry;
  }

  query(filter?: {
    category?: Incident['category'];
    severity?: Incident['severity'];
    since?: number;
    limit?: number;
  }): Incident[] {
    let filtered = [...this.incidents];

    if (filter?.category) {
      filtered = filtered.filter(i => i.category === filter.category);
    }
    if (filter?.severity) {
      filtered = filtered.filter(i => i.severity === filter.severity);
    }
    if (filter?.since) {
      filtered = filtered.filter(i => i.ts >= filter.since!);
    }
    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit!);
    }

    return filtered.reverse(); // Most recent first
  }

  getCritical(limit = 10): Incident[] {
    return this.query({ severity: 'critical', limit });
  }

  getRecent(limit = 50): Incident[] {
    return this.query({ limit });
  }

  clear() {
    this.incidents = [];
    this.persist();
  }

  private persist() {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.incidents));
    } catch (err) {
      console.error('BlackBox persist failed:', err);
    }
  }

  private load() {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.incidents = JSON.parse(stored);
      }
    } catch (err) {
      console.error('BlackBox load failed:', err);
      this.incidents = [];
    }
  }

  export(): string {
    return JSON.stringify(this.incidents, null, 2);
  }

  import(data: string) {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        this.incidents = parsed;
        this.persist();
      }
    } catch (err) {
      console.error('BlackBox import failed:', err);
    }
  }
}

export const blackbox = new BlackBox();
