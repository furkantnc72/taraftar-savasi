from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random, subprocess, os, wave
import numpy as np

W,H,FPS,DUR=540,960,24,60
N=FPS*DUR
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
RED=(214,16,28)
WHITE=(245,245,245)


def F(s):
    return ImageFont.truetype(FONT,s)

def fit_font(draw,s,size,maxw,sw=3):
    f=F(size)
    while draw.textbbox((0,0),s,font=f,stroke_width=sw)[2] > maxw and size>16:
        size-=2
        f=F(size)
    return f

def center_text(draw,y,s,size,color=WHITE,stroke=4,maxw=500):
    f=fit_font(draw,s,size,maxw,stroke)
    b=draw.textbbox((0,0),s,font=f,stroke_width=stroke)
    x=(W-(b[2]-b[0]))/2
    draw.text((x,y),s,font=f,fill=color,stroke_width=stroke,stroke_fill='black')

yy,xx=np.ogrid[:H,:W]
VIGN=np.clip(1-.82*(((xx-W/2)/(W/1.02))**2+((yy-H/2)/(H/1.18))**2),.18,1).astype(np.float32)

def bg(red=28):
    y=np.linspace(0,1,H)[:,None]
    r=(12+red*(0.18+0.82*y)).astype(np.uint8)
    g=(6+9*(1-y)).astype(np.uint8)
    b=(8+12*(1-y)).astype(np.uint8)
    arr=np.zeros((H,W,3),dtype=np.uint8)
    arr[:,:,0]=np.repeat(r,W,1)
    arr[:,:,1]=np.repeat(g,W,1)
    arr[:,:,2]=np.repeat(b,W,1)
    return Image.fromarray(arr)

def vignette(im):
    a=np.asarray(im,np.float32)
    a*=VIGN[:,:,None]
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8))

def grain(im,t):
    rng=np.random.default_rng(int(t*1000)+123)
    a=np.asarray(im,np.int16)
    n=rng.integers(-8,9,size=(H,W,1),dtype=np.int16)
    a=np.clip(a+n,0,255).astype(np.uint8)
    return Image.fromarray(a)

def red_flash(im,amt=.25):
    return Image.blend(im,Image.new('RGB',(W,H),(150,0,10)),amt)

def smoke(draw,t):
    rng=random.Random(44+int(t*10))
    for i in range(14):
        x=rng.randint(-80,W+80)
        y=560+rng.randint(-60,280)
        r=rng.randint(45,120)
        c=40+rng.randint(0,30)
        draw.ellipse((x-r,y-r,x+r,y+r),fill=(c,int(c*0.15),int(c*0.15)))

def light_beams(draw):
    for x in [90,180,360,450]:
        draw.polygon([(x,110),(x+18,110),(x+95,H),(x-55,H)],fill=(45,12,16))

def center_text_local(draw,cx,y,s,size,color=WHITE,stroke=3,maxw=200):
    f=fit_font(draw,s,size,maxw,stroke)
    b=draw.textbbox((0,0),s,font=f,stroke_width=stroke)
    draw.text((cx-(b[2]-b[0])/2,y),s,font=f,fill=color,stroke_width=stroke,stroke_fill='black')

def draw_crest(draw,x,y,scale=1.0,mode='team'):
    w=int(120*scale); h=int(140*scale)
    draw.ellipse((x-w//2,y-h//2,x+w//2,y+h//2),fill=(25,25,28),outline=WHITE,width=max(2,int(4*scale)))
    draw.ellipse((x-w//2+8,y-h//2+8,x+w//2-8,y+h//2-8),outline=RED,width=max(2,int(4*scale)))
    if mode=='team':
        draw.rectangle((x-7*scale,y-30*scale,x+7*scale,y+26*scale),fill=WHITE)
        draw.line((x,y-26*scale,x+22*scale,y-5*scale),fill=WHITE,width=max(2,int(4*scale)))
        draw.line((x,y+4*scale,x+26*scale,y+20*scale),fill=WHITE,width=max(2,int(4*scale)))
        f=F(max(10,int(14*scale)))
        b=draw.textbbox((0,0),'1960',font=f)
        draw.text((x-(b[2]-b[0])/2,y+h*0.22),'1960',font=f,fill=WHITE)
    else:
        pts=[(x,y-48*scale),(x+40*scale,y-16*scale),(x+30*scale,y+48*scale),(x,y+64*scale),(x-30*scale,y+48*scale),(x-40*scale,y-16*scale)]
        draw.polygon(pts,fill=(12,12,14),outline=WHITE)
        f=F(max(15,int(20*scale)))
        b=draw.textbbox((0,0),'DR',font=f)
        draw.text((x-(b[2]-b[0])/2,y-12*scale),'DR',font=f,fill=RED,stroke_width=2,stroke_fill='black')

def draw_bus(draw,x,y,kind='team',scale=1.0):
    bw=int(330*scale); bh=int(125*scale)
    base=(18,18,22) if kind=='team' else (12,12,16)
    draw.rounded_rectangle((x,y,x+bw,y+bh),radius=int(22*scale),fill=base,outline=RED,width=max(2,int(4*scale)))
    draw.polygon([(x+bw-15*scale,y+35*scale),(x+bw+25*scale,y+50*scale),(x+bw+25*scale,y+95*scale),(x+bw-15*scale,y+100*scale)],fill=base,outline=RED)
    for i in range(6):
        wx=x+22*scale+i*44*scale
        draw.rectangle((wx,y+20*scale,wx+34*scale,y+54*scale),fill=(55,8,14),outline=(120,20,25))
    for i in range(2):
        wheelx=x+60*scale+i*180*scale
        draw.ellipse((wheelx,y+95*scale,wheelx+45*scale,y+140*scale),fill=(5,5,6),outline=(120,120,120))
    draw.rectangle((x+18*scale,y+70*scale,x+bw-22*scale,y+88*scale),fill=RED)
    if kind=='team':
        center_text_local(draw,x+bw*0.52,y+67*scale,'BATMAN PETROLSPOR',int(18*scale),WHITE,int(2*scale),int(bw*0.72))
        draw_crest(draw,int(x+48*scale),int(y+62*scale),0.34*scale,'team')
    else:
        center_text_local(draw,x+bw*0.54,y+67*scale,'DARK REDS',int(24*scale),WHITE,int(2*scale),int(bw*0.6))
        draw_crest(draw,int(x+52*scale),int(y+62*scale),0.34*scale,'dark')

def scene_intro(t):
    im=bg(36); d=ImageDraw.Draw(im); light_beams(d)
    for i in range(9):
        y=int((i*120+t*90)%(H+150))-80
        d.polygon([(-80,y),(W+60,y+45),(W+60,y+60),(-80,y+18)],fill=(50,0,6))
    smoke(d,t); draw_crest(d,W//2,280,1.05,'dark')
    center_text(d,390,'DARK REDS',78,RED)
    center_text(d,490,'İSTANBUL ÇIKIŞLI',44)
    center_text(d,548,'DEPLASMAN GECESİ',38,(220,220,220))
    center_text(d,760,'YOL UZUN',48)
    center_text(d,820,'SEVDA DAHA BÜYÜK',42,RED)
    if t<0.14 or 2.2<t<2.36 or 4.2<t<4.36: im=red_flash(im,.4)
    return im

def scene_istanbul(t):
    im=bg(24); d=ImageDraw.Draw(im); d.rectangle((0,0,W,360),fill=(8,10,14))
    buildings=[(20,120,60,360),(75,160,120,360),(145,140,185,360),(205,100,250,360),(270,180,320,360),(345,150,390,360),(420,110,470,360),(485,175,530,360)]
    for a,b,c,e in buildings: d.rectangle((a,b,c,e),fill=(12,12,15))
    d.rectangle((255,80,270,250),fill=(14,14,16)); d.ellipse((235,42,290,95),outline=(25,25,28),width=4)
    d.polygon([(110,H),(430,H),(300,375),(240,375)],fill=(17,17,19)); d.line((110,H,240,375),fill=(115,18,22),width=5); d.line((430,H,300,375),fill=(115,18,22),width=5)
    phase=(t*1.8)%1
    for k in range(11):
        z=(k+phase)/11; y=int(390+(z**1.8)*(H-390)); w=int(2+z*12); l=int(12+z*48)
        d.polygon([(W//2-w,y),(W//2+w,y),(W//2+w*2,y+l),(W//2-w*2,y+l)],fill=(220,220,220))
    for i,x in enumerate([130,170,380,420]):
        yy=640+i*25; d.ellipse((x,yy,x+14,yy+10),fill=(255,180,120)); d.ellipse((x+18,yy,x+32,yy+10),fill=(255,180,120))
    center_text(d,70,'İSTANBUL’DAN',52); center_text(d,128,'YOLA ÇIKIYORUZ',52,RED)
    center_text(d,740,'GECE UZUN',48); center_text(d,805,'DEPLASMAN BAŞLADI',36,(225,225,225))
    return im

def scene_buses(t):
    im=bg(26); d=ImageDraw.Draw(im); d.rectangle((0,0,W,430),fill=(10,10,12))
    for i in range(18):
        x=i*35; h=50+(i*37)%160; d.rectangle((x,430-h,x+28,430),fill=(9,9,11))
    d.rectangle((0,430,W,H),fill=(14,14,17)); draw_bus(d,45,480,'supporter',1.15); draw_bus(d,125,330,'team',0.8)
    d.rounded_rectangle((30,100,240,150),radius=14,fill=(20,20,23),outline=RED,width=3); center_text_local(d,135,110,'TARAFTAR OTOBÜSÜ',24)
    d.rounded_rectangle((300,150,500,196),radius=14,fill=(20,20,23),outline=RED,width=3); center_text_local(d,400,158,'TAKIM OTOBÜSÜ',22)
    center_text(d,780,'AYNI YOL',44); center_text(d,835,'AYNI RENKLER',44,RED)
    return im

def scene_convoy(t):
    im=bg(18); d=ImageDraw.Draw(im); d.rectangle((0,0,W,310),fill=(6,7,10))
    for j in range(12):
        y=310+j*10; d.rectangle((0,y,W,y+8),fill=(20+j*3,4,8))
    d.polygon([(100,H),(440,H),(315,320),(225,320)],fill=(11,11,13)); d.line((100,H,225,320),fill=(110,15,18),width=5); d.line((440,H,315,320),fill=(110,15,18),width=5)
    phase=(t*2.0)%1
    for k in range(12):
        z=(k+phase)/12; y=int(335+(z**1.9)*(H-335)); w=int(3+z*10); L=int(12+z*55)
        d.polygon([(W//2-w,y),(W//2+w,y),(W//2+w*2,y+L),(W//2-w*2,y+L)],fill=(245,245,235))
    for cx in [190,260,330]:
        yy=int(600+(math.sin(t*3+cx)*8)); d.ellipse((cx,yy,cx+16,yy+10),fill=(255,190,100)); d.ellipse((cx+22,yy,cx+38,yy+10),fill=(255,190,100))
    center_text(d,84,'KONVOY HAREKETTE',46); center_text(d,150,'DURMAK YOK',44,RED)
    center_text(d,780,'İSTANBUL > MANİSA',38); center_text(d,830,'DARK REDS YOLDA',34,(220,220,220))
    return im

def scene_match(t):
    im=bg(30); d=ImageDraw.Draw(im); light_beams(d); smoke(d,t)
    d.rounded_rectangle((38,225,W-38,705),radius=26,fill=(8,8,12),outline=RED,width=4)
    draw_crest(d,120,330,0.52,'team'); draw_crest(d,120,590,0.52,'dark')
    center_text_local(d,302,260,'MANİSA FK',44); center_text_local(d,302,330,'BATMAN PETROLSPOR',36)
    center_text_local(d,302,430,'31 EKİM 2026',36,(225,225,225)); center_text_local(d,302,495,'19:00',70,RED)
    center_text_local(d,302,585,'MANİSA 19 MAYIS',34); center_text_local(d,302,635,'DEPLASMAN GECESİ',34,(225,225,225))
    center_text(d,790,'KORKU DEĞİL',40); center_text(d,840,'İNANÇ GETİRİYORUZ',38,RED)
    return im

def scene_crowd(t):
    im=bg(38); d=ImageDraw.Draw(im); smoke(d,t)
    for x in [50,140,400,490]:
        d.line((x,80,x,300),fill=(90,90,95),width=5); d.ellipse((x-24,50,x+24,98),fill=(220,220,215))
    for i in range(27):
        x=i*21-12; y=680+((i*43)%85); d.ellipse((x,y-38,x+24,y-14),fill=(5,5,7)); d.polygon([(x-10,y+72),(x+34,y+72),(x+24,y-12),(x,y-12)],fill=(5,5,7))
    for j,(x,sgn) in enumerate([(92,1),(260,-1),(440,1)]):
        d.line((x,380,x+sgn*24,780),fill=(150,150,150),width=5); wob=18*math.sin(t*4+j)
        d.polygon([(x,390),(x+sgn*120,410+wob),(x+sgn*105,528-wob),(x+sgn*8,510)],fill=(210,15,25))
    d.rounded_rectangle((95,180,445,240),radius=10,fill=(80,10,15),outline='white',width=3); center_text_local(d,270,192,'DARK REDS',34)
    center_text(d,770,'TRİBÜN HAZIR',44); center_text(d,825,'ŞİMDİ SIRA BİZDE',38,RED)
    return im

def scene_finale(t):
    im=bg(42); d=ImageDraw.Draw(im); smoke(d,t)
    for i in range(10):
        y=int((i*120+t*110)%(H+130))-65; d.polygon([(-60,y),(W+70,y+42),(W+70,y+60),(-60,y+22)],fill=(65,0,8))
    draw_crest(d,W//2,280,1.12,'dark'); center_text(d,420,'DARK REDS',72,RED); center_text(d,510,'MANİSA’YA GELİYOR',40)
    center_text(d,760,'İSTANBUL ÇIKIŞLI',42); center_text(d,820,'BİZ GELİYORUZ',52,RED)
    if t>3.0: im=Image.blend(im,Image.new('RGB',(W,H),'black'),min(1,(t-3.0)/1.0))
    return im

SCENES=[(0,8,scene_intro),(8,18,scene_istanbul),(18,28,scene_buses),(28,38,scene_convoy),(38,48,scene_match),(48,56,scene_crowd),(56,60,scene_finale)]

def frame(t):
    for s,e,fn in SCENES:
        if s<=t<e:
            im=fn(t-s)
            if t-s<0.10 and s>0: im=red_flash(im,0.38*(1-(t-s)/0.10))
            return grain(vignette(im),t)
    return grain(vignette(scene_finale(3)),t)

os.makedirs('public/download',exist_ok=True)
p=subprocess.Popen(['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-profile:v','baseline','-level','3.1','-pix_fmt','yuv420p','-crf','26','-maxrate','1100k','-bufsize','2200k','-movflags','+faststart','/tmp/dr_silent.mp4'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for i in range(N): p.stdin.write(np.asarray(frame(i/FPS),np.uint8).tobytes())
p.stdin.close(); p.wait()

sr=44100; n=DUR*sr; tt=np.arange(n)/sr; a=np.zeros(n,np.float32)
for f,amp in [(44,0.05),(57,0.035),(83,0.018)]: a += amp*np.sin(2*np.pi*f*tt)
pulse=(np.sin(2*np.pi*1.12*tt)>0).astype(np.float32); a += 0.03*np.sin(2*np.pi*66*tt)*(0.45+0.55*pulse)
bpm=118; beat=60/bpm
for k in range(int(DUR/beat)+2):
    ix=int(k*beat*sr); L=min(int(0.28*sr),n-ix)
    if L<=0: break
    z=np.arange(L)/sr; a[ix:ix+L] += 0.22*np.sin(2*np.pi*(85-38*z)*z)*np.exp(-z*17)
    if k%2==0:
        L2=min(int(0.18*sr),n-ix); z2=np.arange(L2)/sr; noise=np.random.default_rng(1000+k).normal(0,1,L2)
        a[ix:ix+L2] += 0.05*noise*np.exp(-z2*24)
for st in [0,8,18,28,38,48,56]:
    ix=int(st*sr); L=min(int(0.9*sr),n-ix); z=np.arange(L)/sr
    a[ix:ix+L] += (0.20*np.sin(2*np.pi*(42+6*np.sin(2*np.pi*2*z))*z) + 0.04*np.random.default_rng(200+st).normal(0,1,L))*np.exp(-z*5)
road=np.random.default_rng(77).normal(0,1,n).astype(np.float32); road=np.convolve(road,np.ones(240)/240,mode='same')
a[int(8*sr):int(38*sr)] += 0.018*road[int(8*sr):int(38*sr)]
chant=(np.sin(2*np.pi*2.2*tt)+0.4*np.sin(2*np.pi*4.4*tt))*0.015; a[int(38*sr):] += chant[int(38*sr):]
fin=int(56*sr); a[fin:] += 0.05*np.sin(2*np.pi*39*tt[fin:])
fade=int(2.0*sr); a[-fade:] *= np.linspace(1,0,fade); a=np.tanh(a*1.7)*0.82
with wave.open('/tmp/dr.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((a*32767).astype(np.int16).tobytes())
subprocess.run(['ffmpeg','-y','-i','/tmp/dr_silent.mp4','-i','/tmp/dr.wav','-c:v','copy','-c:a','aac','-b:a','112k','-shortest','-movflags','+faststart','public/download/dark-reds.mp4'],check=True)
print('built',os.path.getsize('public/download/dark-reds.mp4'))