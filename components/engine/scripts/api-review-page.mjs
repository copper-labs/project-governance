/** Deliberately small Markdown renderer: review text never becomes executable HTML. */
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
// Inline code is isolated before emphasis so API syntax cannot turn into markup.
function inline(text) {
  let output=''; let cursor=0;
  const plain = value => escape(value).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  while(cursor<text.length) {
    const start=text.indexOf('`',cursor);
    if(start<0) {output+=plain(text.slice(cursor));break;}
    output+=plain(text.slice(cursor,start));
    let end=start;while(text[end]==='`')end++;
    const run=text.slice(start,end);let close=end;let found=-1;
    while(close<text.length) {
      const next=text.indexOf('`',close);if(next<0)break;
      let stop=next;while(text[stop]==='`')stop++;
      if(stop-next===run.length) {found=next;break;} close=stop;
    }
    if(found> end) {output+='<code>'+escape(text.slice(end,found))+'</code>';cursor=found+run.length;}
    else {output+=escape(run);cursor=end;}
  }
  return output;
}
// Preserve union pipes inside code spans; unsupported escaped pipes stay literal content.
function cells(line) {
  const result=[]; let cell=''; let quoted=false;
  for(let i=1;i<line.length-1;i++) {
    const c=line[i];
    if(c==='`') quoted=!quoted;
    if(c==='|' && !quoted && line[i-1] !== '\\') {result.push(cell);cell='';} else cell+=c;
  }
  result.push(cell);return result;
}
export function reviewPage(review, details, scope = null) {
  const lines = review.replaceAll('\r\n','\n').split('\n'); let code = false; let table = false; let tableRows=0; const body = [];
  for (const line of lines) {
    if (line.startsWith('```')) { if (table) { body.push('</table>'); table=false; } body.push(code ? '</code></pre>' : '<pre><code>'); code=!code; continue; }
    if (code) { body.push(escape(line)+'\n'); continue; }
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!table) { body.push('<table>'); table=true; tableRows=0; }
      if (tableRows++ === 1 && cells(line.trim()).every(cell => /^\s*:?-{3,}:?\s*$/.test(cell))) continue;
      body.push('<tr>'+cells(line.trim()).map(cell=>'<td>'+inline(cell.trim())+'</td>').join('')+'</tr>'); continue;
    }
    if (table) { body.push('</table>'); table=false; }
    const heading=/^(#{1,6})\s+(.*)$/.exec(line);
    body.push(heading ? `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>` : `<p>${inline(line)}</p>`);
  }
  if (code) body.push('</code></pre>'); if(table) body.push('</table>');
  const summary = scope ? '<header><h2>Approval scope</h2><p>Contract: '+escape(scope.contractId)+'</p><p>'+scope.cells.map(c=>escape(c.product+' / '+c.language+' / '+c.platform)).join('<br>')+'</p><p>'+(scope.supersedes ? 'Replaces approval '+escape(scope.supersedes.id)+' revision '+escape(String(scope.supersedes.revision)) : 'Starts a new approval lineage')+'</p></header>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:16px -apple-system;line-height:1.55;margin:32px;max-width:1200px;color:#202020;background:#fff}p{white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f6;padding:16px}table{border-collapse:collapse;width:100%;table-layout:fixed}td{border:1px solid #ccc;padding:10px;vertical-align:top;overflow-wrap:anywhere}details{margin-top:40px}h2{border-top:1px solid #ddd;padding-top:24px}</style></head><body>${summary}${body.join('\n')}<details><summary>Technical identity</summary><pre>${escape(details)}</pre></details></body></html>`;
}
