import { authorizeOperator } from '@/lib/api-auth.mjs';
// app/api/status/route.ts - Live deployment status from Vercel + Railway

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  createdAt: number;
  ready: number;
}

async function getVercelDeployments() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return { 
      ok: false, 
      error: 'VERCEL_TOKEN or VERCEL_PROJECT_ID not set',
      data: null 
    };
  }

  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=5`,
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      return { 
        ok: false, 
        error: `Vercel API returned ${res.status}`,
        data: null 
      };
    }

    const json = await res.json();
    const deployments: VercelDeployment[] = json.deployments || [];

    return {
      ok: true,
      data: {
        project: projectId,
        deployments: deployments.map(d => ({
          id: d.uid,
          name: d.name,
          url: `https://${d.url}`,
          state: d.state,
          createdAt: d.createdAt,
          readyAt: d.ready
        })),
        latest: deployments[0] || null
      }
    };
  } catch (err) {
    return { 
      ok: false, 
      error: 'Provider request failed',
      data: null 
    };
  }
}

async function getRailwayServices() {
  const token = process.env.RAILWAY_TOKEN;
  
  if (!token) {
    return { 
      ok: false, 
      error: 'RAILWAY_TOKEN not set',
      data: null 
    };
  }

  try {
    const query = `
      query {
        projects {
          edges {
            node {
              id
              name
              services {
                edges {
                  node {
                    id
                    name
                    deployments(first: 3) {
                      edges {
                        node {
                          id
                          status
                          createdAt
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query }),
      cache: 'no-store'
    });

    if (!res.ok) {
      return { 
        ok: false, 
        error: `Railway API returned ${res.status}`,
        data: null 
      };
    }

    const json = await res.json();
    
    if (json.errors) {
      return {
        ok: false,
        error: json.errors[0]?.message || 'Railway GraphQL error',
        data: null
      };
    }

    const projects = json.data?.projects?.edges || [];
    const services = projects.flatMap((p: any) => 
      (p.node.services?.edges || []).map((s: any) => ({
        id: s.node.id,
        name: s.node.name,
        project: p.node.name,
        deployments: (s.node.deployments?.edges || []).map((d: any) => ({
          id: d.node.id,
          status: d.node.status,
          createdAt: d.node.createdAt
        }))
      }))
    );

    return {
      ok: true,
      data: { services }
    };
  } catch (err) {
    return { 
      ok: false, 
      error: 'Provider request failed',
      data: null 
    };
  }
}

async function getDiskStatus() {
  return { ok: false, error: 'Device disk telemetry is not connected', data: null };
}

export async function GET(request: Request) {
  const denied = authorizeOperator(request);
  if (denied) return denied;
  const [vercel, railway, disk] = await Promise.allSettled([
    getVercelDeployments(),
    getRailwayServices(),
    getDiskStatus()
  ]);

  return Response.json({
    timestamp: Date.now(),
    status: {
      vercel: vercel.status === 'fulfilled' ? vercel.value : { ok: false, error: 'Promise rejected' },
      railway: railway.status === 'fulfilled' ? railway.value : { ok: false, error: 'Promise rejected' },
      disk: disk.status === 'fulfilled' ? disk.value : { ok: false, error: 'Promise rejected' }
    }
  }, { headers: { 'Cache-Control': 'no-store' } });
}
