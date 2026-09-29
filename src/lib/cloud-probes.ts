import { vercelDeploymentsUrl, type ProbeStatus } from './telemetry';

const CLOUD_CACHE_MS = 60_000;

let cloudCache: { at: number; value: ProbeStatus[] } | null = null;

async function probeVercel(env: NodeJS.ProcessEnv): Promise<ProbeStatus> {
  const token = env.VERCEL_TOKEN;
  const projectId = env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    return {
      name: 'Vercel',
      state: 'unconfigured',
      detail: 'VERCEL_TOKEN or VERCEL_PROJECT_ID is not set',
    };
  }

  try {
    const res = await fetch(vercelDeploymentsUrl(projectId), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { name: 'Vercel', state: 'offline', detail: `Vercel API returned HTTP ${res.status}` };
    }
    const json = await res.json() as { deployments?: Array<{ state?: string }> };
    const deployments = Array.isArray(json.deployments) ? json.deployments : [];
    const latest = deployments[0]?.state ?? 'none';
    return {
      name: 'Vercel',
      state: latest === 'ERROR' ? 'degraded' : 'online',
      detail: `${latest} · ${deployments.length} recent`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vercel request failed';
    return { name: 'Vercel', state: 'offline', detail: message.slice(0, 160) };
  }
}

async function probeRailway(env: NodeJS.ProcessEnv): Promise<ProbeStatus> {
  const token = env.RAILWAY_TOKEN;
  if (!token) {
    return {
      name: 'Railway',
      state: 'unconfigured',
      detail: 'RAILWAY_TOKEN is not set',
    };
  }

  const query = `query { projects { edges { node { id name services { edges { node { id name } } } } } } }`;
  try {
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { name: 'Railway', state: 'offline', detail: `Railway API returned HTTP ${res.status}` };
    }
    const json = await res.json() as {
      errors?: Array<{ message?: string }>;
      data?: { projects?: { edges?: unknown[] } };
    };
    if (json.errors?.length) {
      return {
        name: 'Railway',
        state: 'degraded',
        detail: (json.errors[0]?.message || 'Railway GraphQL error').slice(0, 160),
      };
    }
    const projects = json.data?.projects?.edges?.length ?? 0;
    return {
      name: 'Railway',
      state: 'online',
      detail: `${projects} project${projects === 1 ? '' : 's'} visible`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Railway request failed';
    return { name: 'Railway', state: 'offline', detail: message.slice(0, 160) };
  }
}

export async function probeCloudAdapters(env: NodeJS.ProcessEnv = process.env): Promise<ProbeStatus[]> {
  const useCache = env === process.env;
  if (useCache && cloudCache && Date.now() - cloudCache.at < CLOUD_CACHE_MS) {
    return cloudCache.value;
  }
  const value = await Promise.all([probeVercel(env), probeRailway(env)]);
  if (useCache) cloudCache = { at: Date.now(), value };
  return value;
}
