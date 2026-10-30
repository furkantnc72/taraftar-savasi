from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import math, random, subprocess, os, wave, urllib.request, io
import numpy as np

W,H,FPS,DUR=540,960,24,30
N=FPS*DUR
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
REG='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
ASSET='/tmp/darkreds_real'
os.makedirs(ASSET,exist_ok=True)
os.makedirs('public/download',exist_ok=True)

URLS={
 'batman':'https://www.batman.bel.tr/upload/haber/batman-belediyesi-20260217132454-4013.jpeg',
 'fans':'https://urfanatikcom.teimg.com/crop/1280x720/urfanatik-com/uploads/2026/03/sanliurfaspor-maci-oncesi-batman-petrolsporda-kirmizi-alarm-2.jpg',
 'stadium':'https://www.europlan-online.de/files/c82581ef459e4ae77456a2df542a6369.jpg',
 'bus':'https://i.imgur.com/NlooZmz.jpg'
}

def fetch(name,url):
    path=f'{ASSET}/{name}.jpg'
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=25) as r: data=r.read()
        Image.open(io.BytesIO(data)).convert('RGB').save(path,quality=92)
    except Exception as e:
        print('download failed',name,e)
        Image.new('RGB',(1280,720),(12,12,14)).save(path)
    return path

paths={k:fetch(k,v) for k,v in URLS.items()}
source={k:Image.open(p).convert('RGB') for k,p in paths.items()}

def font(sz,bold=True): return ImageFont.truetype(FONT if bold else REG,sz)

def fit_crop(im,scale=1.0,ox=0.5,oy=0.5):
    iw,ih=im.size
    s=max(W/iw,H/ih)*scale
    nw,nh=max(W,int(iw*s)),max(H,int(ih*s))
    r=im.resize((nw,nh),Image.Resampling.LANCZOS)
    maxx=max(0,nw-W); maxy=max(0,nh-H)
    x=int(maxx*max(0,min(1,ox))); y=int(maxy*max(0,min(1,oy)))
    return r.crop((x,y,x+W,y+H))

def grade(im,red=1.0,dark=.74,contrast=1.28,sat=.55):
    im=ImageEnhance.Color(im).enhance(sat)
    im=ImageEnhance.Contrast(im).enhance(contrast)
    a=np.asarray(im).astype(np.float32)
    a[:,:,0]*=red
    a*=dark
    # lift tiny amount of red in shadows, crush blues
    a[:,:,0]+=6
    a[:,:,2]*=.82
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8))

def vignette(im):
    a=np.asarray(im).astype(np.float32)
    yy,xx=np.ogrid[:H,:W]
    dx=(xx-W/2)/(W/2); dy=(yy-H/2)/(H/2)
    m=np.clip(1-.68*(dx*dx+dy*dy),.28,1).astype(np.float32)
    a*=m[...,None]
    return Image.fromarray(np.clip(a,0,255).astype(np.uint8))

def grain(im,seed,amt=10):
    rng=np.random.default_rng(seed)
    a=np.asarray(im).astype(np.int16)
    g=rng.normal(0,amt,(H,W,1)).astype(np.int16)
    a=np.clip(a+g,0,255).astype(np.uint8)
    return Image.fromarray(a)

def txt(im, text, y, size, color=(245,245,245), stroke=4, maxw=500, spacing=0, bold=True):
    d=ImageDraw.Draw(im)
    f=font(size,bold)
    while d.textbbox((0,0),text,font=f,stroke_width=stroke)[2]>maxw and size>18:
        size-=2; f=font(size,bold)
    b=d.textbbox((0,0),text,font=f,stroke_width=stroke)
    x=(W-(b[2]-b[0]))/2
    # shadow
    d.text((x+5,y+7),text,font=f,fill=(0,0,0),stroke_width=stroke+2,stroke_fill=(0,0,0))
    d.text((x,y),text,font=f,fill=color,stroke_width=stroke,stroke_fill=(5,5,5))

def red_flash(im,strength=.35):
    return Image.blend(im,Image.new('RGB',(W,H),(150,0,8)),strength)

def photo_scene(key,t,dur,zoom0=1.00,zoom1=1.12,panx=(.5,.5),pany=(.5,.5),red=1.08,dark=.68,sat=.55):
    z=zoom0+(zoom1-zoom0)*(t/dur)
    ox=panx[0]+(panx[1]-panx[0])*(t/dur)
    oy=pany[0]+(pany[1]-pany[0])*(t/dur)
    im=fit_crop(source[key],z,ox,oy)
    im=grade(im,red=red,dark=dark,contrast=1.32,sat=sat)
    return vignette(im)

def intro(t):
    im=Image.new('RGB',(W,H),(1,1,2)); d=ImageDraw.Draw(im)
    # faint red haze and vertical scratch
    d.rectangle((0,690,W,H),fill=(18,0,3))
    for i in range(14):
        x=(i*43+int(t*17))%W
        d.line((x,0,x+random.Random(i).randint(-4,4),H),fill=(10,10,11),width=1)
    if t<.35: pass
    else:
        txt(im,'YARIN',330,92,(240,240,240),5)
        txt(im,'DEPLASMAN GECESİ',455,30,(180,180,180),2)
    if .9<t<1.02 or 2.15<t<2.25: im=red_flash(im,.42)
    return grain(vignette(im),int(t*1000)+1,6)

def batman(t):
    im=photo_scene('batman',t,4,1.02,1.18,(.42,.58),(.50,.54),red=1.18,dark=.58,sat=.44)
    d=ImageDraw.Draw(im,'RGB'); d.rectangle((0,0,W,210),fill=(0,0,0))
    txt(im,'BATMAN',50,63,(235,235,235),4)
    txt(im,'GECE BAŞLIYOR',123,31,(210,25,32),2)
    txt(im,'BİR ŞEHİR UYUR',790,28,(185,185,185),2)
    txt(im,'BİZ YOLA ÇIKARIZ',830,35,(245,245,245),3)
    if t<.10: im=red_flash(im,.5)
    return grain(im,int(t*1000)+20,9)

def bus(t):
    im=photo_scene('bus',t,5,1.12,1.32,(.58,.44),(.52,.52),red=1.10,dark=.55,sat=.38)
    # cover coach branding with a dark supporter placard
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((205,420,410,515),radius=12,fill=(8,8,10),outline=(120,8,16),width=3)
    f=font(27); d.text((228,448),'DARK REDS',font=f,fill=(235,235,235),stroke_width=2,stroke_fill='black')
    txt(im,'YOL UZUN',94,48,(240,240,240),4)
    txt(im,'SEVDA DAHA BÜYÜK',151,34,(215,22,30),3)
    txt(im,'BATMAN  •  MANİSA',838,29,(225,225,225),2)
    if t<.10 or 2.1<t<2.18: im=red_flash(im,.38)
    return grain(im,int(t*1000)+60,10)

def fans1(t):
    im=photo_scene('fans',t,5,1.08,1.28,(.52,.48),(.48,.44),red=1.18,dark=.56,sat=.48)
    txt(im,'SESSİZ GELMEYİZ',72,39,(245,245,245),3)
    txt(im,'DARK REDS',122,62,(225,20,28),4)
    txt(im,'HER YERDE',800,33,(205,205,205),2)
    txt(im,'PETROLSPOR',842,42,(245,245,245),3)
    if t<.10 or 3.65<t<3.75: im=red_flash(im,.45)
    return grain(im,int(t*1000)+110,12)

def stadium(t):
    im=photo_scene('stadium',t,5,1.03,1.20,(.45,.55),(.46,.48),red=1.10,dark=.58,sat=.42)
    txt(im,'MANİSA',76,58,(242,242,242),4)
    txt(im,'19 MAYIS',142,33,(210,25,31),2)
    txt(im,'IŞIKLAR YANIYOR',800,31,(190,190,190),2)
    txt(im,'BİZ GELİYORUZ',838,39,(245,245,245),3)
    if t<.10: im=red_flash(im,.44)
    return grain(im,int(t*1000)+160,9)

def matchcard(t):
    im=photo_scene('stadium',min(t,3),4,1.18,1.25,(.50,.50),(.49,.49),red=1.08,dark=.36,sat=.32)
    overlay=Image.new('RGBA',(W,H),(0,0,0,120)); im=Image.alpha_composite(im.convert('RGBA'),overlay).convert('RGB')
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((28,230,W-28,730),radius=26,fill=(4,4,6),outline=(120,10,18),width=3)
    txt(im,'31 EKİM 2026',278,30,(190,190,190),2)
    txt(im,'19:00',320,67,(245,245,245),4)
    d.line((95,415,W-95,415),fill=(105,10,17),width=3)
    txt(im,'MANİSA FK',452,42,(230,230,230),3)
    txt(im,'VS',510,30,(180,20,28),2)
    txt(im,'BATMAN PETROLSPOR',557,34,(245,245,245),3)
    txt(im,'DEPLASMAN',650,30,(210,22,29),2)
    if t<.10: im=red_flash(im,.46)
    return grain(vignette(im),int(t*1000)+210,8)

def final(t):
    im=photo_scene('fans',t,4,1.20,1.38,(.50,.47),(.47,.43),red=1.25,dark=.42,sat=.42)
    d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,H),fill=(0,0,0,0))
    txt(im,'DARK REDS',135,68,(225,18,26),5)
    txt(im,'MANİSA’DA',215,54,(245,245,245),4)
    txt(im,'BİZ GELİYORUZ.',720,43,(245,245,245),3)
    txt(im,'BATMAN PETROLSPOR',786,27,(185,185,185),2)
    if t<.12 or 1.7<t<1.82: im=red_flash(im,.5)
    if t>3.35:
        im=Image.blend(im,Image.new('RGB',(W,H),'black'),min(1,(t-3.35)/.65))
    return grain(vignette(im),int(t*1000)+260,13)

SCENES=[(0,3,intro),(3,7,batman),(7,12,bus),(12,17,fans1),(17,22,stadium),(22,26,matchcard),(26,30,final)]

def frame(t):
    for s,e,fn in SCENES:
        if s<=t<e:
            im=fn(t-s)
            # hard black flash on cuts, more cinematic than cartoon transitions
            local=t-s
            if s>0 and local<.045: return Image.new('RGB',(W,H),'black')
            return im
    return final(4)

# Encode silent video
p=subprocess.Popen(['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-profile:v','baseline','-level','3.1','-pix_fmt','yuv420p','-crf','24','-maxrate','1300k','-bufsize','2600k','-movflags','+faststart','/tmp/dr_silent.mp4'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for i in range(N): p.stdin.write(np.asarray(frame(i/FPS),np.uint8).tobytes())
p.stdin.close(); p.wait()

# Dark cinematic sound design: sub drone, road rumble, metallic hits, whooshes, crowd bed, final bass drop
sr=44100; n=DUR*sr; tt=np.arange(n,dtype=np.float32)/sr
a=np.zeros(n,np.float32)
# low ominous drone
a += .024*np.sin(2*np.pi*42*tt)*(0.72+0.28*np.sin(2*np.pi*.11*tt))
a += .010*np.sin(2*np.pi*63*tt)
rng=np.random.default_rng(20261031)
# road/air bed
noise=rng.normal(0,1,n).astype(np.float32)
low=np.convolve(noise,np.ones(180,dtype=np.float32)/180,mode='same')
a += .035*low
# engine rumble 7-12 sec
m=(tt>=7)&(tt<12)
a[m] += .045*np.sin(2*np.pi*(72+3*np.sin(2*np.pi*.25*tt[m]))*tt[m])
# stadium crowd-like bed 12-30: band-limited turbulent noise with slow swell
crowd=noise-np.convolve(noise,np.ones(28,dtype=np.float32)/28,mode='same')
env=np.clip((tt-12)/4,0,1)*np.clip((31-tt)/2,0,1)
env*=.55+.45*(np.sin(2*np.pi*.38*tt)**2)
a += .025*crowd*env
# rhythmic distant chant pulse from 18s
m=(tt>=18)&(tt<29.4)
chant=(.5+.5*np.sign(np.sin(2*np.pi*1.28*tt[m])))
a[m]+=chant*.006*(np.sin(2*np.pi*185*tt[m])+np.sin(2*np.pi*233*tt[m]))
# cinematic impacts and metal tails
cuts=[0,3,7,12,17,22,26]
for j,st in enumerate(cuts):
    ix=int(st*sr); L=min(int(.82*sr),n-ix)
    z=np.arange(L,dtype=np.float32)/sr
    sub=.32*np.sin(2*np.pi*(58-34*z)*z)*np.exp(-z*7.2)
    metal=.045*(np.sin(2*np.pi*680*z)+.6*np.sin(2*np.pi*1030*z))*np.exp(-z*9)
    a[ix:ix+L]+=sub+metal
# whoosh before scene changes
for j,st in enumerate(cuts[1:]):
    start=max(0,st-.48); ix=int(start*sr); L=min(int(.48*sr),n-ix)
    z=np.arange(L,dtype=np.float32)/sr
    w=rng.normal(0,1,L).astype(np.float32)
    w=np.concatenate(([0],np.diff(w)))
    envw=np.linspace(0,1,L,dtype=np.float32)**2
    a[ix:ix+L]+=.018*w*envw
# kick/percussion only after reveal, sparse and heavy
for st in np.arange(12.5,29.0,0.75):
    ix=int(st*sr); L=min(int(.24*sr),n-ix)
    z=np.arange(L,dtype=np.float32)/sr
    a[ix:ix+L]+=.14*np.sin(2*np.pi*(78-50*z)*z)*np.exp(-z*18)
# final giant boom at 26 and silence tail
ix=int(26*sr); L=min(int(1.2*sr),n-ix); z=np.arange(L)/sr
a[ix:ix+L]+=.23*np.sin(2*np.pi*(45-20*z)*z)*np.exp(-z*4.8)
a[-int(.75*sr):]*=np.linspace(1,0,int(.75*sr))
a=np.tanh(a*1.7)*.82
with wave.open('/tmp/dr.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((a*32767).astype(np.int16).tobytes())

subprocess.run(['ffmpeg','-y','-i','/tmp/dr_silent.mp4','-i','/tmp/dr.wav','-c:v','copy','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart','public/download/dark-reds.mp4'],check=True)
print('built',os.path.getsize('public/download/dark-reds.mp4'))