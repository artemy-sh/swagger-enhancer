"""Edit genuine UI recordings into a 1080p promo with an original score."""
import json
import math
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from frames import Source

OUT=Path(os.environ.get('DEMO_OUTPUT','demo-output'))
FPS=30
W,H=1920,1080
BAR=4*60/110
PAPER='#f5f7fa'
INK='#14181d'
COLORS=['#61affe','#49cc90','#fca130','#50e3c2','#f93e3e','#9012fe','#0d5aa7']
FONT='/System/Library/Fonts/Avenir Next.ttc'
MONO='/System/Library/Fonts/SFNSMono.ttf'
ffmpeg=os.environ.get('DEMO_FFMPEG') or shutil.which('ffmpeg')
if not ffmpeg:
    import imageio_ffmpeg
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()


def font(size,bold=False,mono=False):
    return ImageFont.truetype(MONO if mono else FONT,size,index=0 if mono else 2 if bold else 7)


def text(draw,xy,value,size=30,fill=INK,bold=False,mono=False):
    draw.text(xy,value,font=font(size,bold,mono),fill=fill,stroke_width=0)


def ease(t):
    t=max(0,min(1,t));return t*t*(3-2*t)


def round_mask(size,radius):
    m=Image.new('L',(size[0]*2,size[1]*2));ImageDraw.Draw(m).rounded_rectangle((0,0,m.width-1,m.height-1),radius*2,fill=255)
    return m.resize(size,Image.Resampling.LANCZOS)


def shadow(size,radius=12):
    im=Image.new('RGBA',(size[0]+48,size[1]+48))
    d=ImageDraw.Draw(im);d.rounded_rectangle((24,24,size[0]+24,size[1]+24),radius,fill=(0,0,0,70))
    return im.filter(ImageFilter.GaussianBlur(12))


def intro_layer(t,dark):
    im=Image.new('RGB',(W,H),INK if dark else PAPER);d=ImageDraw.Draw(im)
    fg=PAPER if dark else INK
    muted='#aab8c8' if dark else '#586371'
    # A restrained technical grid gives the moving route stack some depth.
    for x in range(1016,1921,96):d.line((x,100,x,960),fill='#1e2731' if dark else '#e8ecf1')
    for y in range(130,961,96):d.line((990,y,1920,y),fill='#1e2731' if dark else '#e8ecf1')
    text(d,(128,132),'Swagger Enhancer',43,fill=fg,bold=True)
    text(d,(132,259),'YOUR API, IN FOCUS',20,fill=muted,mono=True)
    reveal=ease((t-.12)/.7)
    offset=round((1-reveal)*32)
    text(d,(120,310+offset),'Your API.',136,fill=fg,bold=True)
    text(d,(120,471+offset),'A better flow.',126,fill=fg,bold=True)
    d.line((132,700,230,700),fill=COLORS[0],width=4)
    text(d,(130,739),'Find faster. Explore deeper.',32,fill=muted)
    text(d,(130,934),'A better workflow, built into your docs.',25,fill=muted)
    routes=[('GET','/missions',COLORS[0]),('POST','/launches',COLORS[1]),('PATCH','/cats/{id}/mood',COLORS[3]),('DELETE','/debris/{id}',COLORS[4])]
    for i,(method,route,color)in enumerate(routes):
        progress=ease((t-.24-i*.13)/.66)
        # The stagger resolves into a precise stack instead of a playful bounce.
        drift=math.sin(t*.7+i*.6)*2
        x=1028+round((1-progress)*(390+i*45))
        y=267+i*136+round((1-progress)*35+drift)
        card=Image.new('RGBA',(778,138));c=ImageDraw.Draw(card)
        c.rounded_rectangle((12,10,762,122),15,fill='#202832' if dark else '#ffffff',outline='#344353' if dark else '#d7dfe8',width=2)
        c.rounded_rectangle((12,34,16,98),2,fill=color)
        c.rounded_rectangle((36,40,158,92),7,fill=color)
        width=c.textlength(method,font=font(25,True))
        text(c,(97-width/2,47),method,25,fill=INK,bold=True)
        text(c,(187,47),route,28,fill=fg,mono=True)
        card=card.rotate((1-progress)*(4-i*2),resample=Image.Resampling.BICUBIC)
        im.paste(card,(x-12,y-10),card)
    d=ImageDraw.Draw(im)
    for i,color in enumerate(COLORS):d.rectangle((128+i*238,1040,128+(i+1)*238-8,1044),fill=color)
    return im


def intro(t):
    dark=intro_layer(t,True)
    if t>=.6:return dark
    light=intro_layer(t,False)
    progress=ease((t-.025)/.55)
    edge=W+300-(W+600)*progress
    mask=Image.new('L',(W,H));d=ImageDraw.Draw(mask)
    d.polygon([(edge+150,0),(W+1000,0),(W+1000,H),(edge-150,H)],fill=255)
    im=Image.composite(dark,light,mask)
    if .03<progress<.97:
        # A single blue sweep carries the repaint, then disappears.
        glow=Image.new('RGBA',(W,H));g=ImageDraw.Draw(glow)
        g.line((edge+150,0,edge-150,H),fill=(97,175,254,155),width=10)
        im=Image.alpha_composite(im.convert('RGBA'),glow.filter(ImageFilter.GaussianBlur(14))).convert('RGB')
    return im


cat_frames=[Image.open(OUT/'cat-hop'/f'{n:03}.png').convert('RGBA').resize((560,600),Image.Resampling.LANCZOS) for n in range(79)]


def outro(t):
    im=Image.new('RGB',(W,H),INK);d=ImageDraw.Draw(im)
    text(d,(128,154),'Swagger Enhancer',48,fill=PAPER,bold=True)
    text(d,(122,300),'Make Swagger',106,fill=PAPER,bold=True)
    text(d,(122,431),'feel like yours.',106,fill=PAPER,bold=True)
    text(d,(128,624),'More clarity. Less hunting. A little more personality.',29,fill='#bbc4cf')
    d.rounded_rectangle((128,729,740,809),12,fill=PAPER)
    text(d,(160,747),'Get it on Chrome Web Store',29,bold=True)
    text(d,(128,870),'Link in the description',25,fill='#bbc4cf')
    text(d,(128,944),'No tracking. Just a better Swagger UI.',25,fill='#bbc4cf')
    cat=cat_frames[max(0,min(78,round((t-1.3)*FPS)))]
    im.paste(cat,(1208,170),cat)
    for i,color in enumerate(COLORS):d.rectangle((128+i*238,1040,128+(i+1)*238-8,1044),fill=color)
    return im


browser_size=(1664,878)
browser_mask=round_mask(browser_size,10)
browser_shadow=shadow((1664,914))
def base_scene(chapter):
    im=Image.new('RGB',(W,H),INK)
    im.paste(browser_shadow,(104,128),browser_shadow)
    d=ImageDraw.Draw(im)
    text(d,(128,34),chapter['title'],54,fill=PAPER,bold=True)
    text(d,(130,105),chapter['subtitle'],26,fill='#bbc4cf')
    if chapter['id'] in ['preview','sites']:
        d.rounded_rectangle((1688,53,1790,94),20,fill='#193d31')
        text(d,(1713,59),'New',22,fill='#79e2b1',bold=True)
    d.rounded_rectangle((128,146,1792,1060),12,fill='#23282e')
    for x in [151,173,195]:d.ellipse((x,160,x+9,169),fill='#78828e')
    text(d,(237,149),'localhost:4177/'+('reference'if chapter['id']=='sites'else'docs'),18,fill='#d2d9e1')
    return im


def camera(frame,chapter,t):
    # Brief, purposeful close-ups keep small API text readable. The browser
    # chrome stays still, the camera only reframes the recorded page.
    id=chapter['id']
    if id=='search':
        amount=ease(t/.65)*(1-ease((t-1.9)/.85))
        target=(540,0,900)
    elif id=='preview':
        amount=ease((t-1.35)/.8)*(1-ease((t-chapter['duration']+.7)/.6))
        target=(145,105,1020)
    elif id=='responses':
        amount=ease((t-1.8)/.75)
        target=(130,110,1160)
    else:
        return frame.resize(browser_size,Image.Resampling.LANCZOS)
    if amount<.001:return frame.resize(browser_size,Image.Resampling.LANCZOS)
    x,y,width=target
    width=1440+(width-1440)*amount
    height=width*760/1440
    x=min(x*amount,1440-width);y=min(y*amount,760-height)
    scale=frame.width/1440
    bounds=(round(x*scale),round(y*scale),round((x+width)*scale),min(frame.height,round((y+height)*scale)))
    if bounds[2]-bounds[0]<browser_size[0]:raise RuntimeError('Camera would upscale source footage')
    return frame.crop(bounds).resize(browser_size,Image.Resampling.LANCZOS)


if '--posters' in sys.argv:
    for at in [0,.2,.4,.6,2]:intro(at).save(OUT/f'intro-v3-{at}.jpg',quality=96)
    for at in [1.3,1.87,2.31,2.78,3.12,3.9]:outro(at).save(OUT/f'outro-v3-{at}.jpg',quality=96)
    sys.exit(0)

recordings=json.loads((OUT/'recordings.json').read_text())
order=['theme','search','favorites','copy','authorize','responses','preview','navigation','sites']
scenes=[{'id':'intro','duration':2*BAR},*[recordings[key]for key in order],{'id':'outro','duration':3*BAR}]
total=sum(scene['duration']for scene in scenes)
mute_file=OUT/'swagger-enhancer-picture-v3.mp4'
encoder=subprocess.Popen([ffmpeg,'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-an','-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709','-c:v','libx264','-preset','medium','-threads','4','-crf','12','-x264-params','aq-mode=3:aq-strength=1.2','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',str(mute_file)],stdin=subprocess.PIPE)
elapsed=0
previous=None
posters=[]
try:
    for chapter in scenes:
        count=round((elapsed+chapter['duration'])*FPS)-round(elapsed*FPS)
        print('Editing',chapter['id'],count,'frames',flush=True)
        main=popup=None
        last_valid_source=None
        if chapter['id']not in ['intro','outro']:
            raw_duration=chapter['end']-chapter['start']
            main=Source(chapter['main'])
            base=base_scene(chapter)
            if chapter.get('popup'):
                h=chapter['popupHeight']
                psize=(352,round(h*.55))
                popup=Source(chapter['popupCapture'])
                pmask=round_mask(psize,10)
                pshadow=shadow(psize)
        for frame in range(count):
            t=frame/FPS
            if chapter['id']=='intro':im=intro(t)
            elif chapter['id']=='outro':im=outro(t)
            else:
                moment=chapter['start']+min(1,t/chapter['duration'])*raw_duration
                main_pointer=not popup or main.move_time(moment)>=popup.move_time(moment)
                source=main.read(moment,main_pointer)
                if chapter['id']=='sites':
                    sample=np.asarray(source)[240:1560,160:2900]
                    loading=sample.mean()>250 and sample.std()<8
                    if loading and last_valid_source is not None:source=last_valid_source
                    elif not loading:last_valid_source=source.copy()
                source=camera(source,chapter,t)
                im=base.copy();im.paste(source,(128,182),browser_mask)
                if popup:
                    raw_popup=popup.read(moment,not main_pointer).crop((0,0,chapter['popupWidth'],chapter['popupHeight']))
                    if chapter['id']=='sites':
                        # Adding a rule changes the real container height. Trim
                        # the white browser canvas below this dark popup.
                        rows=np.flatnonzero(np.asarray(raw_popup)[:,10:-10,:].mean(axis=(1,2))<245)
                        height=int(rows[-1]+1) if len(rows) else raw_popup.height
                        dynamic_size=(352,round(height*.55))
                        if dynamic_size!=psize:
                            psize=dynamic_size;pmask=round_mask(psize,10);pshadow=shadow(psize)
                        raw_popup=raw_popup.crop((0,0,raw_popup.width,height))
                    pframe=raw_popup.resize(psize,Image.Resampling.LANCZOS)
                    left,right=chapter['popup']
                    alpha=ease((t-left)/.23)*ease((right-t)/.23)
                    if alpha>0:
                        x=1414+round((1-alpha)*70);y=212
                        if alpha<1:
                            smask=pshadow.getchannel('A').point(lambda v:round(v*alpha))
                            mask=pmask.point(lambda v:round(v*alpha))
                        else:smask=pshadow.getchannel('A');mask=pmask
                        im.paste(pshadow,(x-24,y-24),smask)
                        im.paste(pframe,(x,y),mask)
            if frame<8 and previous is not None:im=Image.blend(previous,im,ease((frame+1)/8))
            if chapter['id']=='outro'and frame>count-16:
                im=Image.blend(im,Image.new('RGB',(W,H),INK),ease((frame-(count-16))/15))
            if frame==min(count-1,round(2*FPS)):
                poster=OUT/f'film-v3-{chapter["id"]}.png';im.save(poster);posters.append(poster)
            encoder.stdin.write(im.tobytes())
        previous=im.copy()
        elapsed+=chapter['duration']
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError('Video encoder failed')
except Exception:
    encoder.kill()
    raise

music=json.loads((OUT/'music.json').read_text())
music_file=OUT/music['file']
measurement=subprocess.run([ffmpeg,'-hide_banner','-i',str(music_file),'-af','loudnorm=I=-16:TP=-1.8:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
levels=json.loads(re.search(r'\{\s*"input_i"[\s\S]*?\}',measurement.stderr).group())
audio_filter='loudnorm=I=-16:TP=-1.8:LRA=9:linear=true:'+':'.join(f'{key}={levels[value]}' for key,value in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
final=OUT/'swagger-enhancer-demo-v3.mp4'
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(mute_file),'-i',str(music_file),'-c:v','copy','-af',audio_filter,'-c:a','aac','-b:a','256k','-ar','48000','-t',f'{total:.6f}','-movflags','+faststart','-metadata','title=Swagger Enhancer - A better flow','-metadata',f'comment=Local Swagger UI demo. Original instrumental score: {music["title"]}, {music["bpm"]} BPM.',str(final)],check=True)
subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(music_file),'-af',audio_filter,'-codec:a','libmp3lame','-b:a','256k',str(music_file.with_suffix('.mp3'))],check=True)
sheet=Image.new('RGB',(1280,math.ceil(len(posters)/3)*265),INK)
draw=ImageDraw.Draw(sheet)
for i,file in enumerate(posters):
    shot=Image.open(file);shot.thumbnail((410,231));x=10+(i%3)*425;y=10+(i//3)*265
    sheet.paste(shot,(x,y));text(draw,(x,y+234),file.stem.replace('film-v3-',''),17,fill=PAPER)
sheet.save(OUT/'contact-sheet-v3.jpg',quality=96)
shutil.copyfile(OUT/'film-v3-intro.png',OUT/'cover-v3.png')
(OUT/'film-v3.json').write_text(json.dumps({'title':'Swagger Enhancer - A better flow','duration':total,'size':[W,H],'fps':FPS,'music':music['title'],'bpm':music['bpm'],'source':'Retina PNG, no lossy intermediate, no camera upscaling','chapters':[{'id':s['id'],'duration':s['duration']}for s in scenes]},indent=2))
if not os.environ.get('DEMO_KEEP_INTERMEDIATE'):mute_file.unlink(missing_ok=True)
print(final,flush=True)
