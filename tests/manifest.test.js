const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
test('PWA declares a dedicated SVG maskable icon',()=>{
 const icon=manifest.icons.find(x=>x.purpose==='maskable');
 assert.ok(icon);
 assert.equal(icon.src,'icons/icon-maskable.svg');
 assert.equal(icon.type,'image/svg+xml');
 const svg=fs.readFileSync(icon.src,'utf8');
 assert.match(svg,/<svg[\s\S]*viewBox="0 0 512 512"/);
 assert.match(svg,/<rect width="512" height="512"/);
});
