import test from 'node:test';
import assert from 'node:assert/strict';
import {readRememberedKey,saveRememberedKey,clearRememberedKey} from '../src/research-dashboard/page.ts';
const key='test-dashboard-key-at-least-24-characters';
const createStore=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
test('remembered dashboard key survives a new page read and clearing leaves pending starts intact',()=>{
  const storage=createStore();storage.setItem('oraklet-pending-start','pending request');
  assert.equal(readRememberedKey(storage),'');assert.equal(saveRememberedKey(storage,key),true);assert.equal(readRememberedKey(storage),key);
  assert.equal(clearRememberedKey(storage),true);assert.equal(readRememberedKey(storage),'');assert.equal(storage.getItem('oraklet-pending-start'),'pending request');
});
test('blocked browser storage does not throw or pretend to remember/clear a credential',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  assert.equal(readRememberedKey(storage),'');assert.equal(saveRememberedKey(storage,key),false);assert.equal(clearRememberedKey(storage),false);
  assert.equal(readRememberedKey(null),'');assert.equal(saveRememberedKey(null,key),false);
});
test('malformed or excessive remembered keys do not initiate automatic authentication',()=>{
  const storage=createStore();for(const value of ['short','x'.repeat(4097),42,null]){storage.setItem('oraklet-dashboard-key',value);assert.equal(readRememberedKey(storage),'');}
});
