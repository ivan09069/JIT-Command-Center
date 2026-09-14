// app/api/control/route.ts - Control requests via Policy Gate

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { authorizeOperator } from '@/lib/api-auth.mjs';
import { gate } from '@/lib/gate';
import type { ControlRequest } from '@/lib/policy';

/**
 * Execute a control request through the Policy Gate
 * 
 * CRITICAL: This is server-side only. Never expose tokens to client.
 */
export async function POST(request: Request) {
  const denied = authorizeOperator(request);
  if (denied) return denied;
  let controlRequest: ControlRequest;
  try { controlRequest = await request.json(); }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!controlRequest || typeof controlRequest !== 'object' || Array.isArray(controlRequest))
    return Response.json({ error: 'Invalid control request' }, { status: 400 });

  // Validate request
  if (!controlRequest.type || !controlRequest.target) {
    return Response.json(
      { error: 'Invalid control request' },
      { status: 400 }
    );
  }

  // Execute through gate (includes policy evaluation)
  const result = await gate.executeControl(controlRequest, async () => {
    // Execute actual control based on type
    switch (controlRequest.type) {
      case 'deploy':
        return await executeDeploy(controlRequest);
      
      case 'redeploy':
        return await executeRedeploy(controlRequest);
      
      case 'restart':
        return await executeRestart(controlRequest);
      
      case 'rollback':
        return await executeRollback(controlRequest);
      
      case 'scale':
        return await executeScale(controlRequest);
      
      default:
        throw new Error(`Unknown control type: ${controlRequest.type}`);
    }
  });

  if (!result.success) {
    return Response.json(
      {
        success: false,
        decision: result.decision
      },
      { status: 403 } // Forbidden (policy blocked)
    );
  }

  return Response.json({
    success: true,
    result: result.result,
    decision: result.decision
  });
}

/**
 * Execute Vercel deployment
 */
async function executeDeploy(request: ControlRequest) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    throw new Error('Vercel credentials not configured');
  }

  // Create new deployment
  const res = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: request.target,
      project: projectId,
      target: 'production',
      gitSource: {
        type: 'github',
        ref: request.params?.ref || 'main'
      }
    })
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Vercel deploy failed: ${error}`);
  }

  return await res.json();
}

/**
 * Execute Vercel redeploy (trigger new build of latest)
 */
async function executeRedeploy(request: ControlRequest) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    throw new Error('Vercel credentials not configured');
  }

  // Get latest deployment
  const listRes = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (!listRes.ok) {
    throw new Error('Failed to get latest deployment');
  }

  const { deployments } = await listRes.json();
  if (!deployments || deployments.length === 0) {
    throw new Error('No deployments found');
  }

  const latestDeployment = deployments[0];

  // Create new deployment from same commit
  const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: latestDeployment.name,
      project: projectId,
      target: 'production',
      gitSource: {
        type: 'github',
        ref: latestDeployment.meta?.githubCommitRef || 'main'
      }
    })
  });

  if (!deployRes.ok) {
    const error = await deployRes.text();
    throw new Error(`Redeploy failed: ${error}`);
  }

  return await deployRes.json();
}

/**
 * Execute Railway service restart
 */
async function executeRestart(request: ControlRequest) {
  const token = process.env.RAILWAY_TOKEN;

  if (!token) {
    throw new Error('Railway credentials not configured');
  }

  // Railway restart via GraphQL
  const mutation = `
    mutation {
      serviceInstanceRedeploy(serviceId: "${request.params?.serviceId}") {
        id
      }
    }
  `;

  const res = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: mutation })
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Railway restart failed: ${error}`);
  }

  const json = await res.json();
  
  if (json.errors) {
    throw new Error(`Railway GraphQL error: ${json.errors[0]?.message}`);
  }

  return json.data;
}

/**
 * Execute rollback (Vercel alias change)
 */
async function executeRollback(request: ControlRequest) {
  const token = process.env.VERCEL_TOKEN;
  
  if (!token) {
    throw new Error('Vercel credentials not configured');
  }

  // This would assign an alias to a previous deployment
  // Simplified version - in production you'd specify which deployment to rollback to
  throw new Error('Rollback not yet implemented (requires deployment target)');
}

/**
 * Execute scale operation (Railway)
 */
async function executeScale(request: ControlRequest) {
  throw new Error('Scale not yet implemented');
}
