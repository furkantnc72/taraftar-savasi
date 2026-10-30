from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, random, subprocess, os, wave
import numpy as np

W,H,FPS,DUR=540,960,24,30
N=FPS*DUR
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def F(s): return ImageFont.truetype(FONT,s)
def text(d,y,s,size,color='white',sw=4,maxw=500):
    f=F(size)
    while d.textbbox((0,0),s,font=f,stroke_width=sw)[2]>maxw and size>18:
        size-=2; f=F(size)
    b=d.textbbox((0,0),s,font=f,stroke_width=sw)
    d.text(((W-(b[2]-b[0]))/2,y),s,font=f,fill=color,stroke_width=sw,stroke_fill='black')

yy,xx=np.ogrid[:H,:W]
vm=np.clip(1-.75*(((xx-W/2)/(W/1.1))**2+((yy-H/2)/(H/1.25))**2),.35,1).astype(np.float32)
cache={}
def bg(red=20):
    if red not in cache:
        y=np.arange(H,dtype=np.float32)[:,None]
        v=6+12*(1-y/H); rr=np.minimum(30,v+red*(.2+.8*y/H))
        a=np.zeros((H,W,3),np.uint8)
        a[:,:,0]=np.repeat(rr.astype(np.uint8),W,1); a[:,:,1]=np.repeat(v.astype(np.uint8),W,1); a[:,:,2]=np.repeat((v+2).astype(np.uint8),W,1)
        cache[red]=Image.fromarray(a)
    return cache[red].copy()
def vig(im):
    a=np.asarray(im,np.float32)*vm[...,None]
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8))
def dots(d,t,n=55):
    r=random.Random(913)
    for i in range(n):
        x=(r.random()*W+t*(i%3-1)*16)%W; y=(r.random()*H+t*(12+r.random()*28))%H
        q=1 if i%5 else 2; d.ellipse((x-q,y-q,x+q,y+q),fill=(150+int(70*r.random()),12,18))
def streak(d,t):
    for i in range(7):
        y=(i*160+int(t*220))%(H+250)-125; x=-100+(i%2)*140
        d.polygon([(x,y),(W+80,y+95),(W+80,y+110),(x,y+15)],fill=(75+20*(i%3),0,5))

def intro(t):
    im=bg(30); d=ImageDraw.Draw(im); streak(d,t); dots(d,t)
    c=(W//2,370); p=1+.06*math.sin(t*8); r=int(130*p)
    for j in range(4): d.ellipse((c[0]-r-j*8,c[1]-r-j*8,c[0]+r+j*8,c[1]+r+j*8),outline=(120+25*j,0,8),width=3)
    text(d,310,'DARK',86); text(d,395,'REDS',86,(225,20,30)); text(d,605,'DEPLASMAN GECESİ',38); text(d,660,'BATMAN PETROLSPOR',28,(225,225,225),2)
    if t<.18 or 1.45<t<1.58 or 3.15<t<3.23: im=Image.blend(im,Image.new('RGB',(W,H),(170,0,10)),.55)
    return vig(im)

def road(t):
    im=bg(14); d=ImageDraw.Draw(im); d.rectangle((0,0,W,340),fill=(7,7,12))
    for j in range(9): d.rectangle((0,280+j*9,W,290+j*9),fill=(25+6*j,3,8))
    d.polygon([(110,H),(430,H),(310,330),(230,330)],fill=(12,12,14)); d.line((110,H,230,330),fill=(110,10,16),width=5); d.line((430,H,310,330),fill=(110,10,16),width=5)
    phase=(t*1.7)%1
    for k in range(9):
        z=(k+phase)/9; y=int(345+(z**1.8)*(H-345)); w=int(3+z*14); L=int(12+z*65)
        d.polygon([(W//2-w,y),(W//2+w,y),(W//2+w*2,y+L),(W//2-w*2,y+L)],fill=(225,225,225))
    sx=300+int(12*math.sin(t*1.5)); d.rounded_rectangle((sx,175,sx+180,263),radius=10,fill=(28,28,30),outline='white',width=4); d.text((sx+21,194),'MANİSA',font=F(36),fill='white'); d.line((sx+90,263,sx+90,365),fill=(150,150,150),width=8)
    text(d,80,'BATMAN  >  MANİSA',42); text(d,760,'YOLLAR UZUN',52); text(d,820,'BİZ HAZIRIZ',48,(225,20,30)); dots(d,t,40)
    return vig(im)

def bus(t):
    im=bg(22); d=ImageDraw.Draw(im)
    for i in range(18):
        x=i*32; h=80+((i*47)%180); d.rectangle((x,530-h,x+28,530),fill=(8,8,11))
    d.rectangle((0,530,W,H),fill=(11,11,13))
    for k in range(9):
        x=int(((k*110-t*250)%(W+180))-90); d.polygon([(x,790),(x+45,790),(x+125,820),(x+70,820)],fill=(190,190,190))
    bx=55+int(10*math.sin(t*2.2)); by=520
    d.rounded_rectangle((bx,by,bx+430,by+185),radius=35,fill=(18,18,22),outline=(150,10,16),width=5); d.rectangle((bx+45,by+30,bx+350,by+100),fill=(38,10,15))
    for i in range(5): d.rectangle((bx+60+i*58,by+42,bx+105+i*58,by+90),fill=(85,7,12))
    d.ellipse((bx+65,by+140,bx+130,by+205),fill=(4,4,5)); d.ellipse((bx+330,by+140,bx+395,by+205),fill=(4,4,5)); d.ellipse((bx+397,by+100,bx+422,by+122),fill=(230,20,25))
    text(d,120,'DEPLASMAN MODU',54); text(d,205,'AÇIK',74,(225,20,30)); text(d,785,'BİR OTOBÜS DEĞİL',34); text(d,835,'BİR TRİBÜN GİDİYOR',38,(235,235,235)); dots(d,t,45)
    return vig(im)

def match(t):
    im=bg(26); d=ImageDraw.Draw(im)
    for x in [65,475]:
        d.line((x,260,x,650),fill=(65,65,70),width=10)
        for y in [235,250,265]: d.rectangle((x-50,y,x+50,y+12),fill=(210,210,195))
    d.ellipse((-150,510,W+150,980),fill=(16,28,20),outline=(85,15,18),width=8)
    d.rounded_rectangle((35,325,W-35,690),radius=28,fill=(9,9,12),outline=(135,12,20),width=4)
    text(d,355,'31 EKİM 2026',34,(215,215,215)); text(d,402,'19:00',70); text(d,510,'MANİSA FK',42); text(d,558,'X',38,(220,20,30)); text(d,602,'BATMAN PETROLSPOR',34)
    text(d,760,'13. HAFTA',30,(210,210,210),2); text(d,808,'DEPLASMAN',46,(225,20,30))
    return vig(im)

def crowd(t):
    im=bg(34); d=ImageDraw.Draw(im)
    for i in range(26):
        x=i*23-15; y=690+((i*37)%80); d.ellipse((x,y-38,x+24,y-14),fill=(5,5,7)); d.polygon([(x-10,y+70),(x+34,y+70),(x+23,y-15),(x,y-15)],fill=(5,5,7))
    for j,(x,sgn) in enumerate([(70,1),(390,-1),(250,1)]):
        d.line((x,370,x+sgn*30,760),fill=(150,150,150),width=5); w=20*math.sin(t*5+j); d.polygon([(x,380),(x+sgn*140,400+w),(x+sgn*125,520-w),(x+sgn*10,500)],fill=(215 if j%2==0 else 130,10,18))
    for x in [110,430]: d.ellipse((x-18,632,x+18,668),fill=(255,55,45)); d.ellipse((x-7,643,x+7,657),fill=(255,240,210))
    text(d,120,'BİR ŞEHİR',52); text(d,185,'BİR ARMA',52); text(d,250,'BİR TUTKU',56,(225,20,30)); text(d,815,'SON NEFESE KADAR',38)
    return vig(im)

def final(t):
    im=bg(40); d=ImageDraw.Draw(im); streak(d,t*1.8); dots(d,t,85); cx=W//2
    sh=[(cx,210),(cx+155,270),(cx+120,540),(cx,650),(cx-120,540),(cx-155,270)]
    d.polygon(sh,fill=(9,9,11),outline=(190,15,22)); text(d,320,'D R',92); text(d,440,'1960',30,(190,190,190),2); text(d,690,'DARK REDS',66,(230,20,30)); text(d,762,'MANİSA’DAYIZ',46); text(d,835,'YOLLAR BİZE DEPLASMAN',27,(220,220,220),2)
    if t>3.6: im=Image.blend(im,Image.new('RGB',(W,H),'black'),min(1,(t-3.6)/.4))
    return vig(im)

sc=[(0,4,intro),(4,9,road),(9,14,bus),(14,20,match),(20,26,crowd),(26,30,final)]
def frame(t):
    for s,e,fn in sc:
        if s<=t<e:
            q=fn(t-s)
            if t-s<.11 and s: q=Image.blend(q,Image.new('RGB',(W,H),(180,0,12)),.45*(1-(t-s)/.11))
            return q
    return final(4)

os.makedirs('public/download',exist_ok=True)
p=subprocess.Popen(['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-profile:v','baseline','-level','3.1','-pix_fmt','yuv420p','-crf','28','-maxrate','800k','-bufsize','1600k','-movflags','+faststart','/tmp/dr_silent.mp4'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for i in range(N): p.stdin.write(np.asarray(frame(i/FPS),np.uint8).tobytes())
p.stdin.close(); p.wait()

sr=44100; n=DUR*sr; tt=np.arange(n)/sr; a=np.zeros(n,np.float32); a+=.035*np.sin(2*np.pi*55*tt)*(0.7+.3*np.sin(2*np.pi*.09*tt)); beat=60/128
for k in range(int(DUR/beat)+2):
    ix=int(k*beat*sr); L=min(int(.22*sr),n-ix)
    if L<=0: break
    z=np.arange(L)/sr; a[ix:ix+L]+=.22*np.sin(2*np.pi*(70-35*z)*z)*np.exp(-z*20)
    if k%2:
        L2=min(int(.16*sr),n-ix); z2=np.arange(L2)/sr; a[ix:ix+L2]+=.055*np.random.default_rng(100+k).normal(0,1,L2)*np.exp(-z2*22)
for st in [0,4,9,14,20,26]:
    ix=int(st*sr); L=min(int(.6*sr),n-ix); z=np.arange(L)/sr; a[ix:ix+L]+=(.17*np.sin(2*np.pi*45*z)+.035*np.random.default_rng(500+st).normal(0,1,L))*np.exp(-z*6)
a=np.tanh(a*1.6)*.78; a[-int(.8*sr):]*=np.linspace(1,0,int(.8*sr))
with wave.open('/tmp/dr.wav','wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((a*32767).astype(np.int16).tobytes())
subprocess.run(['ffmpeg','-y','-i','/tmp/dr_silent.mp4','-i','/tmp/dr.wav','-c:v','copy','-c:a','aac','-b:a','96k','-shortest','-movflags','+faststart','public/download/dark-reds.mp4'],check=True)
print('built',os.path.getsize('public/download/dark-reds.mp4'))