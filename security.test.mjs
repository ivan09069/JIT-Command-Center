import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

async function route(name) {
  let source = readFileSync(new URL(`./src/app/api/${name}/route.ts`, import.meta.url),'utf8');
  source = source.replace("import { gate } from '@/lib/gate';", "const gate = {async executeControl(){return {success:false,decision:'policy remains active'}}};");
  source = source.replace('@/lib/api-auth.mjs', new URL('./src/lib/api-auth.mjs',import.meta.url).href);
  return import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
}
const status = await route('status'), control = await route('control');
const token = 'synthetic-control-fixture-'+'x'.repeat(32);
test('unconfigured or unauthenticated requests cannot reach provider fetch', async () => {
  const originalFetch = globalThis.fetch, prior = process.env.CONTROL_API_TOKEN;
  let calls=0; globalThis.fetch=async()=>{calls++;throw Error('network forbidden');};
  try {
    for (const [configured,expected] of [['',503],[token,401]]) {
      process.env.CONTROL_API_TOKEN=configured;
      assert.equal((await status.GET(new Request('https://example.test/api/status'))).status,expected);
      assert.equal((await control.POST(new Request('https://example.test/api/control',{method:'POST',body:'{}'}))).status,expected);
    }
    assert.equal(calls,0);
  } finally {globalThis.fetch=originalFetch;if(prior===undefined)delete process.env.CONTROL_API_TOKEN;else process.env.CONTROL_API_TOKEN=prior;}
});
test('authenticated provider calls use configured values and disk stays unknown', async () => {
  const originalFetch=globalThis.fetch;
  const values={CONTROL_API_TOKEN:token,VERCEL_TOKEN:'synthetic-vercel',VERCEL_PROJECT_ID:'fixture project',RAILWAY_TOKEN:'synthetic-railway'};
  const prior=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values);
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    return Response.json(String(url).includes('vercel')?{deployments:[{uid:'d1',url:'fixture.example.test'}]}:{data:{projects:{edges:[]}}});
  };
  try {
    const response=await status.GET(new Request('https://example.test/api/status',{headers:{authorization:`Bearer ${token}`}}));
    assert.equal(response.status,200);const body=await response.json();
    assert.equal(body.status.disk.ok,false);assert.equal(body.status.disk.data,null);
    assert.equal(body.status.vercel.data.deployments[0].url,'https://fixture.example.test');
    assert.ok(calls[0].url.includes('fixture%20project'));
    assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-vercel');
    assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-railway');
  } finally {globalThis.fetch=originalFetch;for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('valid operator credential does not override policy or accept invalid JSON', async () => {
  const prior=process.env.CONTROL_API_TOKEN;process.env.CONTROL_API_TOKEN=token;
  try {
    const request=body=>new Request('https://example.test/api/control',{method:'POST',headers:{authorization:`Bearer ${token}`},body});
    assert.equal((await control.POST(request('null'))).status,400);
    assert.equal((await control.POST(request('{'))).status,400);
    assert.equal((await control.POST(request(JSON.stringify({type:'deploy',target:'fixture'})))).status,403);
  } finally {if(prior===undefined)delete process.env.CONTROL_API_TOKEN;else process.env.CONTROL_API_TOKEN=prior;}
});
