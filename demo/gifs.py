"""Build small README demos directly from the lossless UI captures."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from frames import Source

parser=argparse.ArgumentParser()
parser.add_argument('--dest',type=Path,default=Path(__file__).resolve().parent.parent/'docs')
parser.add_argument('--posters',action='store_true')
args=parser.parse_args()
out=Path(os.environ.get('DEMO_OUTPUT','demo-output'))
recordings=json.loads((out/'recordings.json').read_text())
ffmpeg=os.environ.get('DEMO_FFMPEG') or shutil.which('ffmpeg')
if not ffmpeg:
    import imageio_ffmpeg
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
SIZE=(800,450)
FPS=12.5
LANCZOS=Image.Resampling.LANCZOS


def ease(value):
    value=max(0,min(1,value));return value*value*(3-2*value)


def crop(im,x,y,width):
    scale=im.width/1440
    height=width*SIZE[1]/SIZE[0]
    return im.crop(tuple(round(v*scale)for v in (x,y,x+width,y+height))).resize(SIZE,LANCZOS)


def popup_image(source,moment,max_height,section=False,pointer=True):
    im=source.read(moment,pointer).crop((0,0,640,max_height))
    if section:
        rows=np.flatnonzero(np.asarray(im)[:,10:-10,:].mean(axis=(1,2))<245)
        end=int(rows[-1]+1) if len(rows) else im.height
        im=im.crop((0,740,640,max(742,end)))
    return im


def overlay(base,panel,xy,width,alpha=1):
    height=round(panel.height*width/panel.width)
    panel=panel.resize((width,height),LANCZOS)
    mask=Image.new('L',panel.size);d=ImageDraw.Draw(mask)
    d.rounded_rectangle((0,0,width-1,height-1),8,fill=round(255*alpha))
    shadow=Image.new('RGBA',(width+32,height+32));d=ImageDraw.Draw(shadow)
    d.rounded_rectangle((16,16,width+16,height+16),8,fill=(0,0,0,round(105*alpha)))
    shadow=shadow.filter(ImageFilter.GaussianBlur(8))
    x,y=xy;base.paste(shadow,(x-16,y-16),shadow)
    base.paste(panel,(x,y),mask)


specs=[('theme','dark_theme',6.5),('search','search',6.5),('favorites','favorites',8),('preview','schema_preview',8.5),('sites','sites',7.2)]
manifest=[]
for key,name,duration in specs:
    chapter=recordings[key];main=Source(chapter['main']);popup=Source(chapter['popupCapture'])
    staging=out/'readme-frames'/name;staging.mkdir(parents=True,exist_ok=True)
    for file in staging.glob('frame-*.png'):file.unlink()
    navigation=(chapter['main']['clicks'][-1]['time']-chapter['start'])/(chapter['end']-chapter['start'])*duration if key=='search' else 0
    count=round((duration+.9)*FPS)
    samples=[]
    for frame in ([0,count//2,count-1] if args.posters else range(count)):
        time=max(0,min(duration,frame/FPS-.3))
        moment=chapter['start']+time/duration*(chapter['end']-chapter['start'])
        popup_visible=key in ['theme','sites'] or key=='preview' and time<1.5
        main_pointer=not popup_visible or main.move_time(moment)>=popup.move_time(moment)
        raw=main.read(moment,main_pointer)
        if key=='theme':im=crop(raw,80,0,1280)
        elif key=='search':
            progress=ease((time-navigation)/.65)
            im=crop(raw,660+(80-660)*progress,0,780+(1100-780)*progress)
        elif key=='favorites':im=crop(raw,0,0,1100)
        elif key=='preview':im=crop(raw,125,100,900)
        else:im=crop(raw,80,0,1100)
        if popup_visible:
            panel=popup_image(popup,moment,chapter['popupHeight'],key=='sites',not main_pointer)
            if key=='sites':
                # Keep Sites readable while the actual API appears behind it.
                overlay(im,panel,(416,0),372)
            else:
                # Use the active cursor once across the two recorded surfaces.
                if main_pointer:
                    panel=popup.read(moment,False).crop((0,0,640,chapter['popupHeight']))
                alpha=1 if key=='theme' else ease((1.5-time)/.3)
                overlay(im,panel,(512,13),276,alpha)
        target=staging/f'frame-{frame:04}.png'
        if not args.posters:im.save(target)
        if frame in [0,count//2,count-1]:
            poster=staging/f'poster-{frame:04}.png';im.save(poster);samples.append(str(poster))
    if args.posters:
        print(name,'posters',flush=True);continue
    gif=staging/f'{name}.gif'
    filters='[0:v]split[a][b];[a]palettegen=max_colors=256:reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle'
    subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-framerate',str(FPS),'-i',str(staging/'frame-%04d.png'),'-filter_complex',filters,'-loop','0',str(gif)],check=True)
    with Image.open(gif) as check:
        assert check.size==SIZE and check.info.get('loop')==0
        assert check.n_frames>25
        length=0
        for i in range(check.n_frames):check.seek(i);length+=check.info.get('duration',0)
        assert 6000<=length<=11000
        frames=check.n_frames
    assert gif.stat().st_size<2_500_000,(name,'GIF is too large')
    args.dest.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(gif,args.dest/gif.name)
    manifest.append({'file':gif.name,'size':list(SIZE),'frames':frames,'duration_ms':length,'bytes':gif.stat().st_size,'samples':samples})
    print(name,frames,'frames',round(length/1000,2),'s',round(gif.stat().st_size/1024),'KB',flush=True)
if not args.posters:(out/'readme-gifs.json').write_text(json.dumps(manifest,indent=2))
