// lib/bus.ts - Unified Status Bus (event spine for all widgets)

export type EventMap = {
  STATUS_UPDATE: { 
    source: 'vercel' | 'railway' | 'disk' | 'agents' | 'security';
    payload: Record<string, unknown>;
    severity?: 'info' | 'warning' | 'critical';
  };
  THREAT_CHANGED: { 
    level: number; // 0-100
    reason: string;
  };
  INCIDENT_APPEND: { 
    msg: string;
    ts: number;
    category: 'deployment' | 'security' | 'system' | 'agent';
    severity: 'info' | 'warning' | 'critical';
  };
  WIDGET_FOCUS: {
    widgetId: string;
  };
  DEPLOYMENT_STATE: {
    project: string;
    state: 'building' | 'ready' | 'error' | 'deploying';
    url?: string;
  };
  AGENT_REPORT: {
    agentId: string;
    findings: number;
    critical: number;
  };
};

type Handler<K extends keyof EventMap> = (event: EventMap[K]) => void;
type BusEvent = EventMap[keyof EventMap];
type Listener = (event: BusEvent) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener>>();
  private history: Array<{ type: string; event: BusEvent; ts: number }> = [];
  private maxHistory = 1000;

  on<K extends keyof EventMap>(type: K, fn: Handler<K>) {
    const key = String(type);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const listener = fn as Listener;
    this.listeners.get(key)!.add(listener);
    
    // Return unsubscribe function
    return () => this.listeners.get(key)!.delete(listener);
  }

  emit<K extends keyof EventMap>(type: K, event: EventMap[K]) {
    const key = String(type);
    
    // Add to history
    this.history.push({ type: key, event, ts: Date.now() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    // Notify listeners
    this.listeners.get(key)?.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error(`Event handler error for ${key}:`, err);
      }
    });
  }

  getHistory(type?: keyof EventMap, limit = 100) {
    const filtered = type 
      ? this.history.filter(e => e.type === type)
      : this.history;
    return filtered.slice(-limit);
  }

  clear() {
    this.history = [];
  }
}

export const bus = new EventBus();
