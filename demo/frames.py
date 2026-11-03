"""Read lossless UI captures and reconstruct the recorded pointer."""
from bisect import bisect_right
import math
from PIL import Image, ImageDraw

cursor=Image.new('RGBA',(160,224))
cd=ImageDraw.Draw(cursor)
polygon=[(2,1),(2,23),(7,18),(12,27),(16,25),(11,16),(18,16)]
points=[(x*8,y*8)for x,y in polygon]
cd.polygon(points,fill='white');cd.line(points+[points[0]],fill='#17202b',width=12,joint='curve')
cursor=cursor.resize((40,56),Image.Resampling.LANCZOS)


class Source:
    def __init__(self,data):
        self.data=data
        self.frames=sorted(data['frames'],key=lambda f:f['time'])
        if not self.frames or any(f['width']<2880 or f['height']<1519 for f in self.frames):
            raise RuntimeError('Source capture lost Retina resolution')
        self.times=[f['time']for f in self.frames]
        self.moves=data['moves'];self.move_times=[m['time']for m in self.moves]
        self.current=-1;self.image=None

    def move_time(self,time):
        index=bisect_right(self.move_times,time)-1
        return self.move_times[index] if index>=0 else -math.inf

    def read(self,time,pointer=True):
        index=max(0,bisect_right(self.times,time)-1)
        if index!=self.current:
            self.image=Image.open(self.frames[index]['file']).convert('RGB');self.current=index
        im=self.image.copy()
        if not pointer:return im
        # Reconstruct the pointer at the requested timestamps independently
        # of PNG capture cadence. UI pixels stay untouched until final resize.
        overlay=Image.new('RGBA',im.size);d=ImageDraw.Draw(overlay)
        scale=im.width/1440
        for click in self.data['clicks']:
            age=time-click['time']
            if 0<=age<.48:
                p=age/.48;r=(.2+1.45*p)*17*scale
                x,y=click['x']*scale,click['y']*scale
                d.ellipse((x-r,y-r,x+r,y+r),outline=(112,174,253,round(200*(1-p))),width=3)
        if self.moves:
            i=max(0,bisect_right(self.move_times,time)-1);move=self.moves[i]
            x,y=move['x'],move['y']
            if i+1<len(self.moves):
                next=self.moves[i+1];gap=next['time']-move['time']
                if 0<gap<.12:
                    p=max(0,min(1,(time-move['time'])/gap))
                    x+=(next['x']-x)*p;y+=(next['y']-y)*p
            overlay.paste(cursor,(round(x*scale),round(y*scale)),cursor)
        return Image.alpha_composite(im.convert('RGBA'),overlay).convert('RGB')
