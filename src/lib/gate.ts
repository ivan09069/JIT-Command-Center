// lib/gate.ts - Policy Gate Middleware

import { bus } from './bus';
import { blackbox } from './blackbox';
import { policyEngine, type PolicyContext, type ControlRequest, type SecurityState } from './policy';

/**
 * Policy Gate sits between:
 * - Incoming events → bus (monitors and adjusts threat)
 * - Outbound control commands → adapters (blocks unsafe actions)
 */
class PolicyGate {
  private context: PolicyContext = {
    threatLevel: 0,
    securityState: 'SECURITY_UNLOCKED',
    activeDeployments: 0,
    criticalIncidents: 0,
    diskUsage: 0,
    authenticated: false // Set to true after FIDO2 auth
  };

  constructor() {
    this.initializeMonitoring();
  }

  /**
   * Initialize event monitoring to auto-adjust threat
   */
  private initializeMonitoring() {
    // Monitor all events for threat implications
    bus.on('INCIDENT_APPEND', (event) => {
      const threatDelta = policyEngine.evaluateEventThreat('INCIDENT_APPEND', event);
      if (threatDelta > 0) {
        this.adjustThreat(threatDelta, `Incident: ${event.msg}`);
      }

      // Update critical incident count
      if (event.severity === 'critical') {
        this.context.criticalIncidents++;
      }
    });

    bus.on('STATUS_UPDATE', (event) => {
      const threatDelta = policyEngine.evaluateEventThreat('STATUS_UPDATE', event);
      if (threatDelta > 0) {
        this.adjustThreat(threatDelta, `Status update from ${event.source}`);
      }

      // Update context from status
      if (event.source === 'disk' && typeof event.payload.percent === 'number') {
        this.context.diskUsage = event.payload.percent;
      }
    });

    bus.on('DEPLOYMENT_STATE', (event) => {
      const threatDelta = policyEngine.evaluateEventThreat('DEPLOYMENT_STATE', event);
      if (threatDelta > 0) {
        this.adjustThreat(threatDelta, `Deployment ${event.state}: ${event.project}`);
      }
    });

    bus.on('AGENT_REPORT', (event) => {
      const threatDelta = policyEngine.evaluateEventThreat('AGENT_REPORT', event);
      if (threatDelta > 0) {
        this.adjustThreat(threatDelta, `Agent ${event.agentId}: ${event.critical} critical findings`);
      }
    });

    bus.on('THREAT_CHANGED', (event) => {
      this.context.threatLevel = event.level;
    });
  }

  /**
   * Adjust threat level and emit change event
   */
  private adjustThreat(delta: number, reason: string) {
    const oldLevel = this.context.threatLevel;
    const newLevel = Math.max(0, Math.min(100, oldLevel + delta));
    
    if (newLevel !== oldLevel) {
      this.context.threatLevel = newLevel;
      
      bus.emit('THREAT_CHANGED', {
        level: newLevel,
        reason
      });

      blackbox.append({
        msg: `Threat ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}: ${reason}`,
        category: 'system',
        severity: newLevel >= 70 ? 'critical' : newLevel >= 40 ? 'warning' : 'info',
        metadata: { oldLevel, newLevel, delta }
      });
    }
  }

  /**
   * Update security state
   */
  setSecurityState(state: SecurityState) {
    const oldState = this.context.securityState;
    this.context.securityState = state;

    blackbox.append({
      msg: `Security state changed: ${oldState} → ${state}`,
      category: 'security',
      severity: state === 'SECRETS_EXPOSED' ? 'critical' : 'warning',
      metadata: { oldState, newState: state }
    });

    // Auto-adjust threat based on security state
    if (state === 'SECRETS_EXPOSED') {
      this.adjustThreat(30, 'Secrets exposed detected');
    } else if (state === 'KEY_ROTATION_REQUIRED') {
      this.adjustThreat(5, 'Key rotation overdue');
    } else if (state === 'SECURITY_UNLOCKED' && oldState === 'SECURITY_LOCKED') {
      this.adjustThreat(-10, 'Security unlocked');
    }
  }

  /**
   * Set authentication status
   */
  setAuthenticated(authenticated: boolean) {
    this.context.authenticated = authenticated;
    
    if (!authenticated) {
      blackbox.append({
        msg: 'User logged out - controls disabled',
        category: 'security',
        severity: 'info'
      });
    }
  }

  /**
   * Update deployment count
   */
  setActiveDeployments(count: number) {
    this.context.activeDeployments = count;
  }

  /**
   * Evaluate a control request (returns decision)
   */
  evaluateControl(request: ControlRequest): ReturnType<typeof policyEngine.evaluate> {
    const decision = policyEngine.evaluate(request, this.context);

    // Log the decision
    blackbox.append({
      msg: `Control request: ${request.type} ${request.target} → ${decision.allowed ? 'ALLOWED' : 'BLOCKED'}`,
      category: 'system',
      severity: decision.allowed ? 'info' : 'warning',
      metadata: {
        request,
        decision,
        context: this.context
      }
    });

    // Apply threat delta from decision
    if (decision.threatDelta !== 0) {
      this.adjustThreat(decision.threatDelta, decision.reason);
    }

    return decision;
  }

  /**
   * Execute a control request (only if allowed)
   */
  async executeControl(
    request: ControlRequest,
    executor: () => Promise<unknown>
  ): Promise<{ success: boolean; result?: unknown; decision: ReturnType<typeof policyEngine.evaluate> }> {
    const decision = this.evaluateControl(request);

    if (!decision.allowed) {
      return {
        success: false,
        decision
      };
    }

    try {
      const result = await executor();
      
      blackbox.append({
        msg: `Control executed: ${request.type} ${request.target} → SUCCESS`,
        category: 'system',
        severity: 'info',
        metadata: { request, result }
      });

      return {
        success: true,
        result,
        decision
      };
    } catch (error) {
      blackbox.append({
        msg: `Control failed: ${request.type} ${request.target} → ERROR`,
        category: 'system',
        severity: 'critical',
        metadata: { request, error: String(error) }
      });

      // Raise threat on control failure
      this.adjustThreat(10, `Control execution failed: ${error}`);

      return {
        success: false,
        decision
      };
    }
  }

  /**
   * Replace disk and threat readings with the latest local sample.
   * Does not emit events; the status route owns the user-visible feed.
   */
  syncTelemetry(reading: { diskUsage: number; threatLevel: number }) {
    this.context.diskUsage = reading.diskUsage;
    this.context.threatLevel = Math.max(0, Math.min(100, reading.threatLevel));
  }

  /**
   * Get current context (read-only)
   */
  getContext(): Readonly<PolicyContext> {
    return { ...this.context };
  }
}

export const gate = new PolicyGate();
