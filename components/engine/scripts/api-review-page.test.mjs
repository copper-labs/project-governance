import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewPage} from './api-review-page.mjs';
test('review markup cannot execute scripts, fetch images, navigate or submit approval',()=>{
 const html=reviewPage('# APIs\n<script>approve()</script>\n![x](https://evil.invalid/x)\n| RN | Flutter |\n|---|---|\n| old | new |\n```\n</code><script>x</script>\n```','identity');
 assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<a '));assert.ok(!html.includes('<form'));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('<table>'));assert.ok(html.includes('<h1>APIs</h1>'));
 assert.ok(html.includes("default-src 'none'"));assert.ok(html.includes('<details>'));
});
test('all long review sections and final text survive rendering',()=>{
 const text=Array.from({length:12},(_,i)=>`## Section ${i+1}\n${'declaration '.repeat(1000)}`).join('\n');
 const html=reviewPage(text,'digest');for(let i=1;i<=12;i++)assert.ok(html.includes(`<h2>Section ${i}</h2>`));
 assert.equal((html.match(/declaration /g)||[]).length,12000);
});

test('API unions stay in their table cell and code/emphasis remain escaped',()=>{
 const html=reviewPage('| RN | Flutter |\n| `A | B` | **new** |','');
 assert.ok(html.includes('<td><code>A | B</code></td>'));assert.ok(html.includes('<strong>new</strong>'));
});

test('table data remains visible and approval scope is outside collapsed details',()=>{
 const html=reviewPage('| A | B |\n|---|---|\n| :-: | -- |\n| | |','hash',{contractId:'sample',cells:[{product:'p',language:'l',platform:'os'}],supersedes:{id:'old',revision:2}});
 assert.ok(html.includes('<td>:-:</td>'));assert.ok(html.includes('<td>--</td>'));assert.ok(html.includes('<td></td>'));
 assert.ok(html.indexOf('Replaces approval old revision 2') < html.indexOf('<details>'));
});

test('unmatched and multi-backtick code preserves API literal characters',()=>{
 const html=reviewPage('`\n``\n``a ` b``','');
 assert.ok(html.includes('<p>`</p>'));assert.ok(html.includes('<p>``</p>'));assert.ok(html.includes('<code>a ` b</code>'));
});
