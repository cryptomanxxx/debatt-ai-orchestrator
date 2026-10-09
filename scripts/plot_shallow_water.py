"""Render saved synthetic pilot traces; no simulation, fitting or future updates."""
import hashlib
import json
from pathlib import Path
import sys
import math
import subprocess
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

METHODS=('physics-fixed','physics-adaptive','pinn-fixed','pinn-adaptive')
COLORS=('#2563eb','#f59e0b','#16a34a','#dc2626')


def render(path):
    subprocess.run(['node',str(Path(__file__).with_name('check_water_report.mjs')),str(path.resolve())],check=True,timeout=20,capture_output=True)
    raw=path.read_bytes(); report=json.loads(raw)
    if report.get('experimentId')!='shallow-water-hybrid':
        raise ValueError('wrong experiment')
    saved=[]
    for case in report.get('cases',[]):
        test=case['hypothesisTest']
        if test['protocol']['id']!='shallow-water-hybrid-v1':
            raise ValueError('wrong protocol')
        m=test['measured']; truth=np.array(m['testTruth']); t=np.arange(len(truth))*2
        if truth.shape!=(81,4) or not np.isfinite(truth).all():
            raise ValueError('wrong truth')
        fig,axes=plt.subplots(3,1,figsize=(10,10),sharex=True)
        factors=(2,math.sqrt(19.62)); baselines=(2,.3)
        for field,ax in enumerate(axes[:2]):
            index=field*2; factor=factors[field]; baseline=baselines[field]
            ax.plot(t,baseline+factor*truth[:,index],color='black',linewidth=1.8,label='Synthetic reference')
            for method,color in zip(METHODS,COLORS):
                result=m['methods'][method]; trace=result['trace']
                values=np.array([r['mean'][index] for r in trace])
                ax.plot(t[1:],baseline+factor*values,color=color,alpha=.85,label=method)
                if method=='pinn-adaptive':
                    sd=np.sqrt([r['covariance'][index][index] for r in trace])*factor
                    ax.fill_between(t[1:],baseline+factor*values-1.96*sd,baseline+factor*values+1.96*sd,color=color,alpha=.12,label='Hybrid nominal 95% band')
                fs=[r for r in result['forecasts'] if r['originStep']==50]
                origin=trace[49]['mean'][index]
                ax.plot([100]+[r['targetStep']*2 for r in fs],[baseline+factor*origin]+[baseline+factor*r['mean'][index] for r in fs],color=color,linestyle='--',marker='x')
            if field==0:
                obs=m['observations']; times=[r['step']*2 for r in obs if r['values'][0] is not None]
                values=[2+2*r['values'][0] for r in obs if r['values'][0] is not None]
                ax.scatter(times,values,s=8,c='gray',alpha=.6,label='Height sensor x=0')
            ax.axvspan(100,108,color='gray',alpha=.08)
            ax.set_ylabel('Water level (m)' if field==0 else 'Velocity (m/s)')
            ax.grid(alpha=.2)
        axes[0].legend(fontsize=7,ncol=2,loc='upper right')
        for method,color in zip(METHODS,COLORS):
            if method.endswith('adaptive'):
                trace=m['methods'][method]['trace']
                axes[2].plot(t[1:],np.sqrt([r['rUsed'][0] for r in trace])*2,color=color,label=method+' assumed sensor SD')
        axes[2].plot(t,[r['trueNoiseStdM'] for r in m['observations']],color='black',linestyle=':',label='True sensor SD (diagnostic only)')
        axes[2].set_ylabel('Height noise SD (m)');axes[2].set_xlabel('Time (s)');axes[2].legend(fontsize=8);axes[2].grid(alpha=.2)
        fig.suptitle(f'Linear channel-wave pilot: {m["caseName"]}\n{m["decision"]}',fontsize=13)
        fig.text(.5,.012,'x=0. Solid: filtered estimates. Dashed/x: forecasts issued at t=100 s without future sensors.\nSynthetic single Fourier mode; no turbulence or real-water validation. Bands exclude network-weight uncertainty.',ha='center',fontsize=8)
        fig.tight_layout(rect=(0,.045,1,.95))
        for suffix in ('png','svg'):
            destination=path.parent/f'shallow-water-case-{case["case"]}.{suffix}'
            fig.savefig(destination,dpi=160)
            saved.append({'path':destination.name,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
        plt.close(fig)
    manifest={'experimentId':'shallow-water-hybrid','reportSha256':hashlib.sha256(raw).hexdigest(),'files':saved}
    (path.parent/'shallow-water-plots.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Saved {len(saved)} channel plot files for {len(saved)//2} completed cases.')
    return manifest


if __name__=='__main__':
    render(Path(sys.argv[1]))
