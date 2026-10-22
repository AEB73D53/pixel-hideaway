import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, digest, transform, makePermutation, encodePNG, parsePNG, decodeOwnPNG, validateMetadata } from '../dist/core.js';

const key = await deriveKey('测试口令🔑','0123456789abcdef0123456789abcdef');
test('permutation is bijective, deterministic, and keyed',()=>{
  const p=makePermutation(10000,key);
  assert.equal(new Set(p).size,10000);
  assert.deepEqual(p,makePermutation(10000,key));
  assert.notDeepEqual(p,makePermutation(10000,'a'.repeat(64)));
});
for(const [w,h] of [[1,1],[1,401],[503,1],[17,31],[720,540]]){
  test(`exact round trip ${w}×${h} with arbitrary RGBA including transparent pixels`,()=>{
    const input=Uint8Array.from({length:w*h*4},(_,i)=>(Math.imul(i,73)^i>>>4)&255);
    const mixed=transform(input,w,h,key);
    assert.deepEqual(transform(mixed,w,h,key,true),input);
    if(w*h>1)assert.notDeepEqual(mixed,input);
  });
}
test('PNG preserves all channels byte for byte, embeds parameters and detects corruption',async()=>{
  const width=23,height=37,input=Uint8Array.from({length:width*height*4},(_,i)=>(i*43+i%7)%256);
  const meta={version:'PH1',width,height,nonce:'0123456789abcdef0123456789abcdef',checksum:await digest(input),keyCheck:await digest(new TextEncoder().encode('verify/'+key))};
  const scrambled=transform(input,width,height,key);
  const png=await encodePNG(scrambled,width,height,meta),parsed=parsePNG(png,true);
  validateMetadata(parsed.metadata,parsed.header);
  assert.deepEqual(parsed.metadata,meta);
  const decoded=await decodeOwnPNG(parsed);
  assert.deepEqual(decoded,scrambled);
  const restored=transform(decoded,width,height,key,true);
  assert.equal(await digest(restored),meta.checksum);
  const restoredPNG=parsePNG(await encodePNG(restored,width,height),true);
  assert.equal(restoredPNG.metadata,null);
  assert.deepEqual(await decodeOwnPNG(restoredPNG),input);
  png[png.length-5]^=1;
  assert.throws(()=>parsePNG(png,true),/校验/);
});
test('wrong passwords produce distinct key checks and cannot restore',async()=>{
  const badKey=await deriveKey('wrong','0123456789abcdef0123456789abcdef');
  assert.notEqual(await digest(new TextEncoder().encode('verify/'+key)),await digest(new TextEncoder().encode('verify/'+badKey)));
  const data=Uint8Array.from({length:400},(_,i)=>i%256);
  assert.notDeepEqual(transform(transform(data,10,10,key),10,10,badKey,true),data);
});
test('rejects invalid dimensions and malformed PNG',()=>{
  assert.throws(()=>transform(new Uint8Array(4),0,1,key),/尺寸/);
  assert.throws(()=>transform(new Uint8Array(4),12_000_001,1,key),/尺寸/);
  assert.equal(parsePNG(new Uint8Array(20)),null);
  assert.throws(()=>parsePNG(new Uint8Array([137,80,78,71,13,10,26,10])),/完整/);
  assert.throws(()=>validateMetadata({version:'PH0'},{}),/参数/);
});
