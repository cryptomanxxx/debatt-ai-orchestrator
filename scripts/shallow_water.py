"""Bounded linear shallow-water pilot; original implementation, NumPy only.

Discrete physics-informed flow map, not a continuous space-time PINN and not
an implementation/replication of the cited paper's architecture. No free code
or data is accepted from the language model. See SHALLOW-WATER.md.
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import struct
import time

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CONFIG_BYTES = (ROOT / 'research/shallow-water-config.json').read_bytes()
CFG = json.loads(CONFIG_BYTES)
METHODS = ('physics-fixed', 'physics-adaptive', 'pinn-fixed', 'pinn-adaptive')


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def test_data_hash(truth, observations):
    # Canonical IEEE-754 little-endian bytes; JSON float spellings differ
    # between Python and JavaScript (e.g. 1e-05 vs 0.00001).
    chunks=[struct.pack('<d',float(v)) for row in truth for v in row]
    for row in observations:
        chunks.append(struct.pack('<I',row['step']))
        for value in row['values']:
            chunks.extend([bytes([value is not None]),struct.pack('<d',value if value is not None else 0.)])
        chunks.append(struct.pack('<d',row['trueNoiseStdM']))
    return hashlib.sha256(b''.join(chunks)).hexdigest()


def system_matrix(cfg=CFG):
    # q=[eta_cos/H,eta_sin/H,v_cos/c,v_sin/c], c=sqrt(gH).
    k = 2*math.pi/cfg['lengthM']
    adv, wave, drag = k*cfg['currentMps'], k*math.sqrt(cfg['gravityMps2']*cfg['depthM']), cfg['dragPerSecond']
    return np.array([[0,-adv,0,-wave], [adv,0,wave,0],
                     [0,-wave,-drag,-adv], [wave,0,adv,-drag]], dtype=float)


def exact_transition(a, dt):
    # Analytic linear-system reference via eigendecomposition, independently
    # checked against small-step RK4. Neither inference method uses this map.
    val, vec = np.linalg.eig(a)
    result = vec @ np.diag(np.exp(val*dt)) @ np.linalg.inv(vec)
    if np.max(np.abs(result.imag)) > 1e-12:
        raise ValueError('non-real reference')
    return result.real


def rk4_transition(a, dt, substeps):
    b = a*(dt/substeps)
    one = np.eye(4)+b+b@b/2+b@b@b/6+b@b@b@b/24
    return np.linalg.matrix_power(one, substeps)


class Network:
    """4 -> 16 tanh -> 4 residual flow map with explicit analytic backprop."""
    def __init__(self, cfg=CFG):
        self.cfg = cfg
        rng = np.random.default_rng(cfg['network']['trainingSeed'])
        n = cfg['network']['hidden']
        self.params = [rng.normal(0, .2, (4,n)), np.zeros(n), np.zeros((n,4)), np.zeros(4)]

    def forward(self, x):
        w,b,v,d = self.params
        hidden = np.tanh(x@w+b)
        return x+.3*(hidden@v+d), hidden

    def predict(self, q):
        scale = self.cfg['network']['stateScale']
        return self.forward(np.asarray(q)/scale)[0]*scale

    def loss_grad(self, x, target, collocation, a):
        y, hidden = self.forward(x)
        z, ch = self.forward(collocation)
        residual = z-collocation-self.cfg['dtSeconds']*((collocation+z)/2)@a.T
        weight = self.cfg['network']['physicsWeight']
        data_loss = np.mean((y-target)**2)
        physics_loss = np.mean(residual**2)
        gy = 2*(y-target)/y.size
        # residual row derivative: B=I-dt*A/2; dr/dz=B.
        bmat = np.eye(4)-self.cfg['dtSeconds']*a/2
        gz = 2*weight*residual@bmat/residual.size
        grads = [np.zeros_like(p) for p in self.params]
        for inputs, activations, output_grad in ((x,hidden,gy),(collocation,ch,gz)):
            gv = .3*activations.T@output_grad
            gd = .3*output_grad.sum(axis=0)
            pre_grad = (.3*output_grad@self.params[2].T)*(1-activations**2)
            grads[0] += inputs.T@pre_grad
            grads[1] += pre_grad.sum(axis=0)
            grads[2] += gv
            grads[3] += gd
        return float(data_loss+weight*physics_loss), grads, float(data_loss), float(physics_loss)

    def train(self, a):
        start = time.perf_counter()
        cfg = self.cfg['network']
        x = np.random.default_rng(cfg['trainingSeed']+10).uniform(-1,1,(cfg['samples'],4))
        collocation = np.random.default_rng(cfg['collocationSeed']).uniform(-1,1,(cfg['samples'],4))
        # Offline RK4-generated pairs; no measurements/test trajectory used.
        target = x@rk4_transition(a,self.cfg['dtSeconds'],8).T
        moments = [np.zeros_like(p) for p in self.params]
        variances = [np.zeros_like(p) for p in self.params]
        initial = self.loss_grad(x,target,collocation,a)[0]
        for step in range(1,cfg['epochs']+1):
            _,grads,_,_ = self.loss_grad(x,target,collocation,a)
            for i,grad in enumerate(grads):
                moments[i] = .9*moments[i]+.1*grad
                variances[i] = .999*variances[i]+.001*grad**2
                self.params[i] -= cfg['learningRate']*(moments[i]/(1-.9**step))/(np.sqrt(variances[i]/(1-.999**step))+1e-8)
        final,_,data_loss,physics_loss = self.loss_grad(x,target,collocation,a)
        validation = np.random.default_rng(cfg['validationSeed']).uniform(-1,1,(cfg['samples'],4))
        vy = self.forward(validation)[0]
        vr = vy-validation-self.cfg['dtSeconds']*((validation+vy)/2)@a.T
        exact = validation@exact_transition(a,self.cfg['dtSeconds']).T
        # Serialize actual weights so artifacts can reproduce every transition.
        return {'architecture':[4,cfg['hidden'],4], 'activation':'tanh', 'flowMap':'q + 0.3*scale*MLP(q/scale)',
                'epochs':cfg['epochs'], 'initialLoss':initial, 'finalLoss':final,
                'dataLoss':data_loss, 'physicsLoss':physics_loss,
                'validationTransitionMse':float(np.mean((vy-exact)**2)*cfg['stateScale']**2),
                'validationPhysicsResidualMse':float(np.mean(vr**2)*cfg['stateScale']**2),
                'weights':[p.tolist() for p in self.params], 'trainingSeconds':time.perf_counter()-start,
                'trainingUsesTestObservations':False}


def positive_covariance(p):
    p = (p+p.T)/2
    eigen, vectors = np.linalg.eigh(p)
    # Round-off correction only. Material loss of positivity aborts the run.
    if eigen.min() < -1e-10 or not np.isfinite(eigen).all():
        raise ValueError('invalid covariance')
    return (vectors*np.maximum(eigen,1e-12))@vectors.T


def sigma_points(mean, covariance, cfg=CFG):
    n = len(mean)
    pars = cfg['ukf']
    lam = pars['alpha']**2*(n+pars['kappa'])-n
    spread = np.linalg.cholesky(positive_covariance(covariance)*(n+lam))
    points = np.vstack([mean, mean+spread.T, mean-spread.T])
    wm = np.full(2*n+1,1/(2*(n+lam)))
    wc = wm.copy()
    wm[0] = lam/(n+lam)
    wc[0] = wm[0]+1-pars['alpha']**2+pars['beta']
    return points,wm,wc


def ukf_predict(mean, covariance, transition, cfg=CFG):
    points,wm,wc = sigma_points(mean,covariance,cfg)
    propagated = transition(points)
    pm = wm@propagated
    centered = propagated-pm
    pp = (centered.T*wc)@centered+np.eye(4)*cfg['ukf']['processVariance']
    return pm,positive_covariance(pp),float(np.max(np.abs(points)))


def ukf_update(mean, covariance, observation, active, rdiag, adaptive, cfg=CFG):
    if not len(active):
        return mean,covariance,rdiag.copy(),None
    points,wm,wc = sigma_points(mean,covariance,cfg)
    measured = points[:,active]  # two height coefficient sensors, x=0,L/4.
    ym = wm@measured
    dy,dx = measured-ym,points-mean
    state_part = (dy.T*wc)@dy
    s = state_part+np.diag(rdiag[active])
    cross = (dx.T*wc)@dy
    gain = np.linalg.solve(s,cross.T).T
    innovation = observation[active]-ym
    posterior = mean+gain@innovation
    pcov = positive_covariance(covariance-gain@s@gain.T)
    next_r = rdiag.copy()
    if adaptive:
        pars = cfg['ukf']
        # Covariance matching from current innovation, used ONLY on next step.
        candidate = np.clip(innovation**2-np.diag(state_part),
                            pars['measurementVariance'],pars['maximumMeasurementVariance'])
        next_r[active] = (1-pars['adaptiveRate'])*rdiag[active]+pars['adaptiveRate']*candidate
    nis = float(innovation@np.linalg.solve(s,innovation)/len(active))
    return posterior,pcov,next_r,nis


def fields(q, covariance=None, cfg=CFG):
    # 32 spatial points over one period; zero mode is fixed by mass conservation.
    phase = np.arange(32)*2*math.pi/32
    basis = np.column_stack([np.cos(phase),np.sin(phase)])
    height = cfg['depthM']*(1+basis@q[:2])
    velocity = cfg['currentMps']+math.sqrt(cfg['gravityMps2']*cfg['depthM'])*basis@q[2:]
    if covariance is None:
        return height,velocity
    hv = cfg['depthM']**2*np.einsum('ij,jk,ik->i',basis,covariance[:2,:2],basis)
    vv = cfg['gravityMps2']*cfg['depthM']*np.einsum('ij,jk,ik->i',basis,covariance[2:,2:],basis)
    return height,velocity,np.sqrt(np.maximum(hv,0)),np.sqrt(np.maximum(vv,0))


def measure(records, cfg=CFG):
    sums = {'heightMse':0.,'velocityMse':0.,'heightCoverage95':0.,'velocityCoverage95':0.}
    for rec in records:
        h,v,hs,vs = fields(np.array(rec['mean']),np.array(rec['covariance']),cfg)
        th,tv = fields(np.array(rec['truth']),cfg=cfg)
        sums['heightMse'] += float(np.mean((h-th)**2))
        sums['velocityMse'] += float(np.mean((v-tv)**2))
        sums['heightCoverage95'] += float(np.mean(np.abs(h-th)<=1.96*hs))
        sums['velocityCoverage95'] += float(np.mean(np.abs(v-tv)<=1.96*vs))
    return {k:v/len(records) for k,v in sums.items()} | {'origins':len(records)}


def classify(metrics, cfg=CFG):
    # Primary: filter + both forecast horizons + both physical fields.
    # No model/hyperparameter selection on these errors.
    candidate = metrics['pinn-adaptive']
    references = [metrics['physics-fixed'],metrics['physics-adaptive'],metrics['pinn-fixed']]
    checks = []
    for endpoint in ['filter','forecast4','forecast8']:
        for field in ['heightMse','velocityMse']:
            for reference in references:
                a,b = candidate[endpoint][field],reference[endpoint][field]
                checks.append(a <= (1-cfg['primaryRelativeGain'])*b and b-a > cfg['primaryAbsoluteGain'])
    return 'hybrid_improves_all' if all(checks) else 'mixed_or_no_improvement'


def generate_test(seed, case, cfg=CFG):
    rng = np.random.default_rng(np.random.SeedSequence([int(seed),case,901]))
    a = system_matrix(cfg)
    exact = exact_transition(a,cfg['dtSeconds'])
    q = rng.uniform(-.025,.025,4)
    truth = [q.copy()]
    for _ in range(cfg['steps']):
        q = exact@q
        truth.append(q.copy())
    truth = np.array(truth)
    noise = rng.normal(size=(cfg['steps']+1,2))
    std = np.full(cfg['steps']+1,math.sqrt(cfg['ukf']['measurementVariance']))
    if case > 0:
        std[cfg['noiseSwitchStep']:] *= cfg['highNoiseMultiplier']
    observations = truth[:,:2]+noise*std[:,None]
    mask = np.ones_like(observations,dtype=bool)
    mask[0] = False  # All methods start from the same blind prior.
    if case == 2:
        mask[::3,1] = False
        mask[::5,:] = False
    return truth,observations,mask,std


def evaluate_method(transition, adaptive, truth, observations, mask, cfg=CFG):
    start = time.perf_counter()
    mean = np.zeros(4)
    cov = np.eye(4)*cfg['ukf']['initialVariance']
    rdiag = np.full(2,cfg['ukf']['measurementVariance'])
    trace,forecasts = [],[]
    maximum_sigma = 0.
    for step in range(1,cfg['steps']+1):
        mean,cov,sigma = ukf_predict(mean,cov,transition,cfg)
        maximum_sigma = max(maximum_sigma,sigma)
        used_r = rdiag.copy()
        active = np.flatnonzero(mask[step])
        mean,cov,rdiag,nis = ukf_update(mean,cov,observations[step],active,rdiag,adaptive,cfg)
        trace.append({'step':step,'seconds':step*cfg['dtSeconds'],'mean':mean.tolist(),
                      'covariance':cov.tolist(),'truth':truth[step].tolist(),
                      'rUsed':used_r.tolist(),'rNext':rdiag.tolist(),'nisPerObservedSensor':nis})
        if step in cfg['forecastOrigins']:
            fm,fp = mean.copy(),cov.copy()
            for ahead in range(1,max(cfg['horizonSteps'])+1):
                fm,fp,sigma = ukf_predict(fm,fp,transition,cfg)
                maximum_sigma = max(maximum_sigma,sigma)
                if ahead in cfg['horizonSteps']:
                    forecasts.append({'originStep':step,'horizonSeconds':ahead*cfg['dtSeconds'],
                                      'targetStep':step+ahead,'mean':fm.tolist(),'covariance':fp.tolist(),
                                      'truth':truth[step+ahead].tolist()})
    metrics = {'filter':measure([r for r in trace if r['step']>=cfg['burnInSteps']],cfg)}
    for ahead in cfg['horizonSteps']:
        seconds = ahead*cfg['dtSeconds']
        metrics[f'forecast{seconds}'] = measure([r for r in forecasts if r['horizonSeconds']==seconds],cfg)
    metrics['runtimeSeconds'] = time.perf_counter()-start
    nis_values = [r['nisPerObservedSensor'] for r in trace if r['nisPerObservedSensor'] is not None]
    metrics['meanNisPerObservedSensor'] = float(np.mean(nis_values)) if nis_values else None
    metrics['maximumAbsoluteSigmaCoordinate'] = maximum_sigma
    metrics['sigmaOutsideTrainingBox'] = maximum_sigma>cfg['network']['stateScale']
    metrics['minimumCovarianceEigenvalue'] = min(float(np.linalg.eigvalsh(r['covariance']).min()) for r in trace)
    metrics['minimumEstimatedDepthM'] = min(float(fields(np.array(r['mean']),cfg=cfg)[0].min()) for r in trace)
    return {'metrics':metrics,'trace':trace,'forecasts':forecasts}


def controls(a, net, cfg=CFG):
    dt = cfg['dtSeconds']
    exact = exact_transition(a,dt)
    fine = rk4_transition(a,dt,40)
    finer = rk4_transition(a,dt,80)
    reference_error = float(np.max(np.abs(exact-finer)))
    refinement_error = float(np.max(np.abs(fine-finer)))
    # UKF equals standard KF in this linear limit (positive numerical control).
    transition = lambda q:q@exact.T
    q = np.array([.01,-.02,.005,.015]); p=np.diag([.0004,.0003,.0002,.0001])
    pm,pp,_=ukf_predict(q,p,transition,cfg)
    kp=exact@p@exact.T+np.eye(4)*cfg['ukf']['processVariance']
    r=np.full(2,cfg['ukf']['measurementVariance']); obs=np.array([.008,-.015])
    um,up,_,_=ukf_update(pm,pp,obs,np.array([0,1]),r,False,cfg)
    gain=np.linalg.solve(kp[:2,:2]+np.diag(r),kp[:,:2].T).T
    km=exact@q+gain@(obs-(exact@q)[:2]); kc=kp-gain@kp[:2,:]
    kf_error=max(float(np.max(np.abs(um-km))),float(np.max(np.abs(up-kc))))
    # Gradient check verifies the real combined loss, including physics term.
    rng=np.random.default_rng(77); x=rng.normal(0,.2,(5,4)); col=rng.normal(0,.2,(6,4))
    target=x@rk4_transition(a,dt,8).T
    _,grads,_,_=net.loss_grad(x,target,col,a)
    errors=[]
    for pi,index in ((0,(1,2)),(1,(3,)),(2,(4,1)),(3,(2,))):
        old=net.params[pi][index]; eps=1e-6
        net.params[pi][index]=old+eps; plus=net.loss_grad(x,target,col,a)[0]
        net.params[pi][index]=old-eps; minus=net.loss_grad(x,target,col,a)[0]
        net.params[pi][index]=old
        errors.append(abs((plus-minus)/(2*eps)-grads[pi][index]))
    result={'referenceAgainstRk4MaxError':reference_error,'rk4StepHalvingMaxError':refinement_error,
            'linearUkfAgainstKalmanMaxError':kf_error,'networkGradientMaxError':max(errors),
            'zeroModeMassConservedByConstruction':True}
    if reference_error>1e-9 or refinement_error>1e-9 or kf_error>1e-10 or max(errors)>1e-7:
        raise ValueError('numerical control failed')
    return result


def experiment(seed, case):
    if not isinstance(seed,str) or not seed.isascii() or not seed.isdigit() or not 1<=len(seed)<=9 or type(case) is not int or case not in range(3):
        raise ValueError('invalid input')
    started=time.perf_counter(); a=system_matrix(); net=Network(); training=net.train(a)
    truth,observations,mask,std=generate_test(seed,case)
    dt=CFG['dtSeconds']; midpoint=np.eye(4)+dt*a+dt**2*a@a/2
    results={}
    for method in METHODS:
        transition=net.predict if method.startswith('pinn') else lambda q:q@midpoint.T
        results[method]=evaluate_method(transition,method.endswith('adaptive'),truth,observations,mask)
    metrics={key:value['metrics'] for key,value in results.items()}
    checks=controls(a,net)
    if min(value['minimumEstimatedDepthM'] for value in metrics.values())<=0:
        raise ValueError('non-positive depth')
    minimum_truth=min(float(fields(q)[0].min()) for q in truth)
    visible_observations=[{'step':i,'values':[float(observations[i,j]) if mask[i,j] else None for j in range(2)],
                           'trueNoiseStdM':float(std[i]*CFG['depthM'])} for i in range(len(truth))]
    return {'caseName':CFG['cases'][case], 'decision':classify(metrics), 'metrics':metrics,
            'training':training,'controls':checks,'methods':results,
            'observations':visible_observations,
            'testTruth':truth.tolist(),'minimumTrueDepthM':minimum_truth,
            'testDataSha256':test_data_hash(truth,visible_observations),
            'runtimeSeconds':time.perf_counter()-started,
            'realWorldValidated':False,'turbulenceSimulated':False}


def main():
    raw=sys.stdin.buffer.read(1025)
    if len(raw)>1024: raise ValueError('oversized input')
    value=json.loads(raw)
    if type(value) is not dict or set(value)!={'seed','case'}: raise ValueError('invalid input')
    if np.__version__!='2.3.5': raise ValueError('unlocked numpy')
    result=experiment(value['seed'],value['case'])
    envelope={'tool':'shallow-water-hybrid','adapterVersion':CFG['id'],
              'configSha256':hashlib.sha256(CONFIG_BYTES).hexdigest(),
              'sourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'inputSha256':fingerprint(value),'versions':{'numpy':np.__version__},
              'runtime':'github-actions-python','factualityChecked':False,'result':result}
    print(json.dumps(envelope,separators=(',',':'),allow_nan=False))


if __name__=='__main__':
    main()
