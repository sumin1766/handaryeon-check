import { mock } from 'bun:test';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
let role: string | null = null, status = 200, writes = 0;
const seasonId = '22222222-2222-4222-8222-222222222222';
const db = { rpc: async () => ({data:role,error:null}), from: (table: string) => {
  const q = { select: () => q, eq: () => q,
    maybeSingle: async () => ({ data: table === 'seasons' ? { id:seasonId,name:'모의 캠프' } : {body:'# 안내',updated_at:'2026-11-28T00:00:00Z'},error:null }),
    upsert: async () => { writes++; return {error:null}; } }; return q;
}, storage: { from: () => ({ upload: async () => {writes++; return {error:null};} }) } };
mock.module('@tanstack/react-start/server', () => ({setResponseStatus:(n:number)=>{status=n;},setResponseHeader:()=>{}}));
mock.module('@/integrations/supabase/client.server',()=>({supabaseAdmin:db}));
mock.module('@tanstack/react-start',()=>({ createServerFn:()=>{
  let validate: (d: unknown) => unknown = (d) => d;
  const b = { inputValidator: (fn: typeof validate) => {validate=fn;return b;}, handler: (fn: (o:{data:unknown})=>unknown) => (o?:{data:unknown}) => fn({data:validate(o?.data)}) };return b;
}}));
const {getPublicGuide,saveAdminGuide,uploadGuideImage,getAdminGuide}=await import('./guide.functions');
test('public response contains only body seasonName updatedAt',async()=> assert.deepEqual(Object.keys(await getPublicGuide()).sort(),['body','seasonName','updatedAt']));
for(const r of [null,'staff','user']) {
 test(`${r ?? 'unauthenticated'} save returns 401 without writes`,async()=> {role=r;status=200;const n=writes;await assert.rejects(()=>saveAdminGuide({data:{password:r ? 'mock-only':'',seasonId,body:'X'}}));assert.equal(status,401);assert.equal(writes,n);});
 test(`${r ?? 'unauthenticated'} upload returns 401 without writes`,async()=> {role=r;status=200;const n=writes;const form=new FormData();form.set('password',r?'mock-only':'');form.set('seasonId',seasonId);form.set('file',new File(['bad'],'x.png',{type:'image/png'}));await assert.rejects(()=>uploadGuideImage({data:form}));assert.equal(status,401);assert.equal(writes,n);});
}
test('admin read completes before editing',async()=> {role='admin';assert.equal((await getAdminGuide({data:{password:'mock-only',seasonId}})).body,'# 안내');});
test('admin oversized body rejected without writes',async()=> {role='admin';const n=writes;await assert.rejects(()=>saveAdminGuide({data:{password:'mock-only',seasonId,body:'x'.repeat(20001)}}));assert.equal(writes,n);});
test('admin save writes only dedicated guide table',async()=> {role='admin';const n=writes;await saveAdminGuide({data:{password:'mock-only',seasonId,body:'모의 안내'}});assert.equal(writes,n+1);});
test('admin wrong image rejected without upload',async()=> {role='admin';const n=writes;const form=new FormData();form.set('password','mock-only');form.set('seasonId',seasonId);form.set('file',new File(['GIF89a'],'x.gif',{type:'image/gif'}));await assert.rejects(()=>uploadGuideImage({data:form}));assert.equal(writes,n);});
test('admin image larger than 5MB rejected without upload',async()=> {role='admin';const n=writes;const form=new FormData();form.set('password','mock-only');form.set('seasonId',seasonId);form.set('file',new File([new Uint8Array(5*1024*1024+1)],'x.png',{type:'image/png'}));await assert.rejects(()=>uploadGuideImage({data:form}));assert.equal(writes,n);});
