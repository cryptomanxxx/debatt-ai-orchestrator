import dataset from './macrodata.json' with { type: 'json' };
import { fingerprint } from './python-tools.mjs';
import { validateScienceResult } from './science.mjs';
import { ResearchError } from './errors.mjs';

export const VARIABLES = Object.freeze({realgdp:'real BNP',realcons:'real konsumtion',realinv:'reala investeringar'});
export const PILOT_PROTOCOL = Object.freeze({id:'macro-ar1-hypothesis-v1',
  h0:'phi=0',h1:'phi!=0',method:'ar1',alpha:.05,
  transformation:'400 * ln(x[t]/x[t-1]), rounded to six decimals; annualized quarterly log growth',
  sample:'Last 144 growth observations: first 128 training, final 16 chronological holdout.',
  selection:'Choose exactly one variable using metadata only; no observations or statistics before commitment.',
  inference:'One fixed lag, intercept, two-sided nominal conditional OLS/Student-t test. One selected hypothesis, no search over data or lag order.',
  assumptions:'Stationary AR(1) growth with iid homoskedastic innovations. Assumptions are not established by this pilot.',
  limitations:'Historical observational data with possible structural breaks and heteroskedasticity. Nominal p-values are conditional on assumptions, not causal proof or proof of novelty. Non-rejection does not establish H0. Holdout forecasts do not enter the hypothesis test. Repeated runs do not provide independent confirmation.'});

export function hypothesisPrompt() {
  return [{role:'system',content:'Du är Professor Oraklet. Formulera en avgränsad ekonomisk hypotes om lagg-1-beroende i tillväxten av EN variabel. Välj realgdp, realcons eller realinv. Du ser bara metadata, inga observationer eller analysresultat. Metod och hypotesklass är redan avgränsade till AR(1) med intercept och tvåsidigt test. Svara endast med JSON med exakt variable, question (svensk forskningsfråga), rationale (svensk motivering), h0:"phi=0", h1:"phi!=0", method:"ar1". Du får inte skriva kod, välja fler variabler, byta metod eller påstå att resultat är kända.'},
    {role:'user',content:JSON.stringify({variables:VARIABLES,dataset:dataset.metadata,protocol:PILOT_PROTOCOL})}];
}
export function parseHypothesis(text) {
  try {
    const p=JSON.parse(text);
    if(!p || Object.keys(p).sort().join(',')!=='h0,h1,method,question,rationale,variable'
      || !Object.hasOwn(VARIABLES,p.variable) || p.h0!=='phi=0' || p.h1!=='phi!=0' || p.method!=='ar1'
      || !['question','rationale'].every(k=>typeof p[k]==='string' && p[k].trim() && p[k].length<=(k==='question'?400:800)))
      throw new Error();
    return {...p,question:p.question.trim(),rationale:p.rationale.trim()};
  } catch { throw new ResearchError('invalid_model_proposal'); }
}
export function pilotData(variable) {
  if(!Object.hasOwn(VARIABLES,variable)) throw new ResearchError('invalid_plan');
  const rows=dataset.rows;
  if(rows.length!==203 || rows[0].period!=='1959Q1' || rows.at(-1).period!=='2009Q3') throw new ResearchError('invalid_tool_evidence');
  const growth=rows.slice(1).map((r,i)=>{
    const x=Number(r[variable]),previous=Number(rows[i][variable]);
    if(!Number.isFinite(x) || !Number.isFinite(previous) || x<=0 || previous<=0) throw new ResearchError('invalid_tool_evidence');
    return (400*Math.log(x/previous)).toFixed(6);
  }).slice(-144);
  return {input:{train:growth.slice(0,128),holdout:growth.slice(128)},
    periods:{trainingStart:rows.at(-144).period,trainingEnd:rows.at(-17).period,
      holdoutStart:rows.at(-16).period,holdoutEnd:rows.at(-1).period}};
}
export async function runHypothesisPilot(propose,callTool,onCommit,onProgress=async()=>{}) {
  const ai=await propose(hypothesisPrompt()),hypothesis=parseHypothesis(ai.text);
  const {input,periods}=pilotData(hypothesis.variable);
  const control={train:Array.from({length:65},(_,i)=>String([1,0,-1,0][i%4])),holdout:['0','-1','0','1']};
  const commitment={hypothesis,protocol:PILOT_PROTOCOL,dataset:dataset.metadata,
    datasetSha256:fingerprint(dataset),input,periods,control,controlExpectation:'do_not_reject_h0'};
  const sha256=fingerprint(commitment);
  await onCommit({...commitment,sha256}); // Must persist successfully before either tool executes.
  const formulation={hypothesis,provider:ai.provider,model:ai.model,commitment:sha256};
  await onProgress(formulation);
  const evidence=await callTool(input),measured=validateScienceResult(evidence,'statsmodels',input);
  await onProgress({...formulation,evidence,measured});
  const controlEvidence=await callTool(control),controlMeasured=validateScienceResult(controlEvidence,'statsmodels',control);
  if(Math.abs(controlMeasured.phi)>1e-10 || controlMeasured.pvalue<.999 || controlMeasured.decision!=='do_not_reject_h0')
    throw new ResearchError('invalid_tool_evidence');
  return {schemaVersion:2,experimentId:'oraklet-macro-hypothesis-pilot',researcher:'Professor Oraklet',
    title:'Oraklets första hypotesförsök med verkliga makrodata',status:'passed',executionStatus:'completed',
    statusMeaning:'passed means the execution and independent controls passed; it does not mean H1 is true.',
    formulationScope:'Model chooses a variable and writes a question and rationale inside a fixed AR(1) hypothesis class; not unrestricted autonomous discovery.',
    ...formulation,protocol:PILOT_PROTOCOL,dataset:dataset.metadata,datasetSha256:fingerprint(dataset),periods,data:input,
    evidence,controlEvidence,independentlyVerified:true,hypothesisOutcome:measured.decision,
    conclusion:measured.decision==='reject_h0'?'Förkasta H0 under de angivna AR(1)-antagandena.':'Förkasta inte H0; detta bevisar inte att tidsberoende saknas.',
    limitations:PILOT_PROTOCOL.limitations};
}
