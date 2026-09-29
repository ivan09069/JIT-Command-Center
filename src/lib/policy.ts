// lib/policy.ts - Policy Gate Rule Engine

import type { EventMap } from './bus';

export type PolicyDecision = {
  allowed: boolean;
  reason: string;
  threatDelta: number;
  actions: string[];
  metadata?: Record<string, unknown>;
};

export type SecurityState = 
  | 'SECURITY_LOCKED' 
  | 'SECURITY_UNLOCKED' 
  | 'KEY_ROTATION_REQUIRED'
  | 'SECRETS_EXPOSED'
  | 'SIGNING_AVAILABLE';

export interface PolicyContext {
  threatLevel: number;
  securityState: SecurityState;
  activeDeployments: number;
  criticalIncidents: number;
  diskUsage: number;
  authenticated: boolean;
}

export interface ControlRequest {
  type: 'deploy' | 'restart' | 'scale' | 'redeploy' | 'rollback';
  target: string; // deployment name
  params?: Record<string, unknown>;
}

/**
 * Policy Gate evaluates whether an action should be allowed
 * based on current system state and security posture.
 */
export class PolicyEngine {
  
  /**
   * Evaluate a control request against current context
   */
  evaluate(request: ControlRequest, context: PolicyContext): PolicyDecision {
    // Default: deny unless explicitly allowed
    let decision: PolicyDecision = {
      allowed: false,
      reason: 'No policy matched',
      threatDelta: 0,
      actions: []
    };

    // Rule 1: Must be authenticated for any control
    if (!context.authenticated) {
      return {
        allowed: false,
        reason: 'Authentication required',
        threatDelta: 5,
        actions: ['LOGIN_REQUIRED']
      };
    }

    // Rule 2: Security must be unlocked for deployments
    if (request.type === 'deploy' && context.securityState === 'SECURITY_LOCKED') {
      return {
        allowed: false,
        reason: 'Security locked - unlock required for deployments',
        threatDelta: 0,
        actions: ['UNLOCK_SECURITY']
      };
    }

    // Rule 3: Block if secrets exposed
    if (context.securityState === 'SECRETS_EXPOSED') {
      return {
        allowed: false,
        reason: 'CRITICAL: Secrets exposed - rotate keys before any action',
        threatDelta: 20,
        actions: ['ROTATE_KEYS', 'AUDIT_SECURITY']
      };
    }

    // Rule 4: Block deployments if disk critical (>98%)
    if (request.type === 'deploy' && context.diskUsage > 98) {
      return {
        allowed: false,
        reason: 'Disk critical (>98%) - cleanup required',
        threatDelta: 10,
        actions: ['CLEANUP_DISK']
      };
    }

    // Rule 5: Block if threat level critical (≥80)
    if (context.threatLevel >= 80) {
      return {
        allowed: false,
        reason: 'Threat level CRITICAL (≥80) - stabilize system first',
        threatDelta: 0,
        actions: ['INVESTIGATE_THREAT', 'RESOLVE_INCIDENTS']
      };
    }

    // Rule 6: Warn if threat elevated (60-79)
    if (context.threatLevel >= 60 && context.threatLevel < 80) {
      decision = {
        allowed: true,
        reason: 'Allowed with elevated threat warning',
        threatDelta: 5,
        actions: ['MONITOR_CLOSELY']
      };
    }

    // Rule 7: Key rotation required - allow but warn
    if (context.securityState === 'KEY_ROTATION_REQUIRED') {
      return {
        allowed: true,
        reason: 'Allowed - but key rotation overdue',
        threatDelta: 2,
        actions: ['SCHEDULE_KEY_ROTATION']
      };
    }

    // Rule 8: Allow safe operations
    const safeOperations: ControlRequest['type'][] = ['restart', 'redeploy'];
    if (safeOperations.includes(request.type)) {
      return {
        allowed: true,
        reason: `Safe operation: ${request.type}`,
        threatDelta: 0,
        actions: ['LOG_ACTION']
      };
    }

    // Rule 9: Deploy operations - check deployment limit
    if (request.type === 'deploy') {
      if (context.activeDeployments >= 10) {
        return {
          allowed: false,
          reason: 'Deployment limit reached (max 10)',
          threatDelta: 0,
          actions: ['CLEANUP_OLD_DEPLOYMENTS']
        };
      }

      return {
        allowed: true,
        reason: 'Deploy approved',
        threatDelta: 0,
        actions: ['MONITOR_DEPLOYMENT']
      };
    }

    // Rule 10: Rollback - always allow (emergency escape hatch)
    if (request.type === 'rollback') {
      return {
        allowed: true,
        reason: 'Rollback approved (emergency)',
        threatDelta: -5, // Lower threat on rollback
        actions: ['LOG_ROLLBACK']
      };
    }

    return decision;
  }

  /**
   * Evaluate if a bus event should raise threat level
   */
  evaluateEventThreat(eventType: keyof EventMap, eventData: unknown): number {
    const record = typeof eventData === 'object' && eventData !== null
      ? eventData as Record<string, unknown>
      : {};
    let threatDelta = 0;

    switch (eventType) {
      case 'INCIDENT_APPEND':
        if (record.severity === 'critical') threatDelta += 10;
        if (record.severity === 'warning') threatDelta += 3;
        break;

      case 'STATUS_UPDATE':
        if (record.severity === 'critical') threatDelta += 5;
        break;

      case 'DEPLOYMENT_STATE':
        if (record.state === 'error') threatDelta += 8;
        break;

      case 'AGENT_REPORT':
        if (typeof record.critical === 'number' && record.critical > 0) {
          threatDelta += record.critical * 2;
        }
        break;
    }

    return threatDelta;
  }
}

export const policyEngine = new PolicyEngine();
