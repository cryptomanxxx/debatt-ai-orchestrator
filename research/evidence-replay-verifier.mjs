// Deterministic, read-only replay against immutable abstract archive versions.
// Verification is of quotation occurrence, never scientific truth.
import { evidencePrompt,hashText } from './literature-evidence.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/i;
export async function replayEvidence(report,{readVersion}={}) {
  const results=[];
  for(const paper of report.papers??[]){
    if(paper.status!=='summarized') continue;
    const version=paper.archive?.version_id;
    const base={article_id:paper.article_id,archive_version_id:UUID.test(version??'')?version:null};
    if(!UUID.test(version??'') || typeof readVersion!=='function'){
      results.push({...base,status:'unverifiable',reason:'archive_version_unavailable'});continue;
    }
    let loaded;
    try { loaded=await readVersion(version); }
    catch {results.push({...base,status:'unverifiable',reason:'archive_read_failed'});continue;}
    if(!loaded){results.push({...base,status:'unverifiable',reason:'archive_version_missing'});continue;}
    const abstract=loaded.abstract;
    if(typeof abstract!=='string'||abstract.length>12000||!SHA.test(paper.content?.sha256??'')
      ||hashText(abstract)!==paper.content.sha256 || loaded.content?.sha256!==paper.content.sha256
      ||loaded.content?.provider!==paper.content.provider ||loaded.content?.url!==paper.content.url
      ||loaded.archive?.version_id!==version){
      results.push({...base,status:'rejected',reason:'archive_identity_or_hash_mismatch'});continue;
    }
    let prompt;
    try {prompt=evidencePrompt(paper,abstract);}
    catch {results.push({...base,status:'rejected',reason:'invalid_replay_prompt'});continue;}
    const source=prompt.source_text;
    if(hashText(source)!==paper.content.analyzed_sha256
      || prompt.source_text_is_truncated!==paper.content.truncated
      || !paper.findings?.every(f=>source.includes(f.quote)
        && (f.context_quote==null||source.includes(f.context_quote)))){
      results.push({...base,status:'rejected',reason:'analyzed_content_or_quote_mismatch'});continue;
    }
    results.push({...base,status:'verified',reason:'archive_quote_match'});
  }
  return results;
}
