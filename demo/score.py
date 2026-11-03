"""Quiet Orbit, an original lofi instrumental with synthesized instruments."""
import json
import os
from pathlib import Path
import wave
import numpy as np
from scipy.signal import butter, sosfilt

RATE=48000
BPM=80
BEAT=60/BPM
BAR=4*BEAT
DURATION=72
out=Path(os.environ.get('DEMO_OUTPUT','demo-output'))
out.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(804177)
length=round((DURATION+3)*RATE)
mix=np.zeros((length,2),dtype=np.float32)
room=np.zeros_like(mix)


def hz(note):return 440*2**((note-69)/12)


def low(signal,cutoff):
    return sosfilt(butter(2,cutoff,btype='lowpass',fs=RATE,output='sos'),signal)


def add(signal,start,gain=1,pan=0,send=0):
    a=round(start*RATE)
    if a<0:signal=signal[-a:];a=0
    n=min(len(signal),length-a)
    if n<=0:return
    values=signal[:n]*gain
    stereo=values[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)])
    mix[a:a+n]+=stereo
    room[a:a+n]+=stereo*send


def keys(note,duration=3.8):
    t=np.arange(round(duration*RATE))/RATE
    f=hz(note)
    wow=.0006*np.sin(2*np.pi*.43*t)+.00022*np.sin(2*np.pi*4.1*t)
    phase=2*np.pi*f*(t+wow)
    # Warm tine and body, with the upper partials fading quickly.
    body=np.sin(phase)+.22*np.sin(phase*2.001)*np.exp(-t*1.6)+.09*np.sin(phase*3.003)*np.exp(-t*3.5)
    env=(1-np.exp(-t*160))*np.exp(-t*.73)*np.minimum(1,(duration-t)/.24)
    return (low(body,2200)*env*(.97+.03*np.sin(2*np.pi*4.8*t))*.7).astype(np.float32)


def pad(notes,duration):
    t=np.arange(round((duration+1.5)*RATE))/RATE
    v=np.zeros_like(t)
    for n in notes:
        for detune in [.999,1.001]:
            phase=2*np.pi*hz(n)*detune*t+rng.uniform(0,2*np.pi)
            v+=np.sin(phase)+.16*np.sin(2*phase)
    env=np.minimum(1,t/.9)*np.exp(-np.maximum(0,t-duration)/.5)*np.minimum(1,(t[-1]-t)/.09)
    return (low(v/len(notes)/2,850)*env).astype(np.float32)


def bass(note,duration):
    t=np.arange(round(duration*RATE))/RATE
    phase=2*np.pi*hz(note)*t
    v=np.sin(phase)+.22*np.sin(2*phase)+.045*np.sin(3*phase)
    env=(1-np.exp(-t*85))*np.minimum(1,(duration-t)/.18)*np.exp(-t*.19)
    return (low(v,360)*env).astype(np.float32)


def kick():
    t=np.arange(round(.55*RATE))/RATE
    phase=2*np.pi*(43*t+35*.045*(1-np.exp(-t/.045)))
    return (np.sin(phase)*(1-np.exp(-t*600))*np.exp(-t*10)*np.minimum(1,(.55-t)/.08)).astype(np.float32)


def snare():
    t=np.arange(round(.25*RATE))/RATE
    noise=sosfilt(butter(2,[900,4800],btype='bandpass',fs=RATE,output='sos'),rng.normal(0,1,len(t)))
    body=.23*np.sin(2*np.pi*180*t)*np.exp(-t*22)
    env=(1-np.exp(-t*480))*np.exp(-t*24)*np.minimum(1,(.25-t)/.04)
    return ((noise*.5+body)*env).astype(np.float32)


def hat():
    t=np.arange(round(.12*RATE))/RATE
    v=sosfilt(butter(2,[3800,8300],btype='bandpass',fs=RATE,output='sos'),rng.normal(0,1,len(t)))
    return (v*np.exp(-t*55)*(1-np.exp(-t*950))*np.minimum(1,(.12-t)/.025)).astype(np.float32)


# Dmaj9 - Bm9 - Gmaj9 - A9, each held for two relaxed bars.
chords=[[50,57,61,64,66],[47,54,57,61,62],[43,50,54,57,59],[45,52,55,59,61]]
roots=[26,35,31,33]
motifs=[[(.6,69,1),(2.6,66,.85)],[(1.1,66,.85),(3.2,64,.65)],[(.6,62,1.2),(2.7,66,.8)],[(1.1,64,1),(3,61,.8)]]
for b in range(24):
    start=b*BAR
    i=(b//2)%4
    chord=chords[i] if b<23 else chords[0]
    root=roots[i] if b<23 else roots[0]
    intro=b<2
    breathing=16<=b<19
    outro=b>=23
    energy=.68 if intro else .82 if breathing else 1
    if b%2==0 or outro:
        add(pad(chord,5.5 if not outro else 2.2),start,.16*energy,-.13,send=.3)
        for j,note in enumerate(chord):add(keys(note,5.2),start+j*.016,.22*energy,(j-2)*.10,send=.34)
    else:
        for j,note in enumerate(chord[1:]):add(keys(note,3.4),start+.42*BEAT+j*.014,.12*energy,(j-1.5)*.12,send=.32)
    if not outro:
        for at,duration,gain in [(0,1.25,.34),(1.75,.7,.24),(3.1,.58,.21)]:
            if intro and at>0:continue
            add(bass(root,duration),start+at*BEAT,gain*energy)
    else:add(bass(root,2.7),start,.29)
    if 2<=b<23 and not breathing:
        # Half-beat swing, soft backbeat and humanized velocities.
        for at,gain in [(0,.40),(1.65,.23),(2.5,.30)]:add(kick(),start+at*BEAT,gain)
        for at in [1.035,3.045]:add(snare(),start+at*BEAT,.18*rng.uniform(.92,1.06),.08,send=.19)
        for step in range(8):
            at=step*.5+(.065 if step%2 else 0)
            add(hat(),start+at*BEAT,.042*rng.uniform(.65,1.05),-.25 if step%2 else .25)
    elif not outro:
        for at in [0,2.57]:add(hat(),start+at*BEAT,.022,-.15)
        if breathing:add(kick(),start,.20)
    # Leave room between phrases, no bright repeating arpeggio.
    if b>=4 and b<23 and b%2==1:
        for at,note,gain in motifs[i]:add(keys(note,2.6),start+at*BEAT,.12*gain,.18,send=.42)
# A gentle sub pulse accompanies the title's dark repaint.
add(bass(26,1.8),.32,.16)
# Diffuse, low-passed room reflections rather than audible rhythmic echoes.
for delay,gain in [(.031,.24),(.053,.21),(.079,.19),(.113,.16),(.173,.13),(.251,.10),(.353,.07),(.479,.05),(.653,.035),(.877,.025)]:
    n=round(delay*RATE)
    v=room[:-n,::-1] if int(delay*1000)%2 else room[:-n]
    mix[n:]+=v*gain
mix=mix[:round(DURATION*RATE)]
mix=np.tanh(mix*1.08)
mix[:round(.12*RATE)]*=np.linspace(0,1,round(.12*RATE))[:,None]
fade=round(1.8*RATE);mix[-fade:]*=np.linspace(1,0,fade)[:,None]
mix*=.82/max(float(np.max(np.abs(mix))),.001)
file='quiet-orbit.wav'
with wave.open(str(out/file),'wb') as wav:
    wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(RATE)
    wav.writeframes((mix*32767).astype('<i2').tobytes())
(out/'music.json').write_text(json.dumps({'title':'Quiet Orbit','file':file,'bpm':BPM,'duration':DURATION,'sample_rate':RATE,'original':True,'style':'Calm lofi, warm electric piano, extended jazz chords, deep soft bass and a relaxed swung beat.','sources':'Synthesized instruments, no samples or external tracks.'},indent=2))
print(out/file)
