# Builds LIGWORDS in index.html. Needs en50k.txt from
# https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt next to it.
import re
rows=[l.split() for l in open('en50k.txt',encoding='utf-8')]
freq={w:int(n) for w,n in rows if re.fullmatch(r"[a-z]+",w)}
LIG=re.compile(r'ffi|ffl|ff|fi|fl')
def real(x,c): return freq.get(x,0)*10>=freq[c]          # a word in its own right, not a typo'd copy of c
keep=[];drop=[];seen=set();extra=[]   # extra = LIGEXTRA: words left out above only because their broken form is a real word
for c in sorted(freq,key=lambda w:-freq[w]):
    if not LIG.search(c) or len(c)<3: continue
    if any(freq.get(c[:i],0)>1000*freq[c] and freq.get(c[i:],0)>1000*freq[c] for i in range(1,len(c))): drop.append((c,'two words')); continue   # 'offthe' is two words run together
    t=LIG.sub('',c); g=' '.join(LIG.sub(' ',c).split())
    if c!='off' and (len(t)<2 or real(t,c)): drop.append((c,t)); extra.append(c); continue
    p=g.split()
    if len(p)>1 and all(len(x)>=3 and real(x,c) for x in p): drop.append((c,g)); continue
    if t in seen or g in seen: continue
    seen.add(t); seen.add(g); keep.append(c)
print(len(keep),len(drop)); print('dropped',drop[:60]); print('kept head',keep[:60])
open('ligwords.txt','w').write(' '.join(keep)); open('ligextra.txt','w').write(' '.join(w for w in extra if w not in ('chffffff','pfft')))
