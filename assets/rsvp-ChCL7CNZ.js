import{r as w}from"./animations-D9Wo9mUM.js";class c{constructor(){this.listeners=new Set,this.STORAGE_KEY="titan_reader_prefs_v15_true_book",this.config=this.loadFromStorage()}static getInstance(){return c.instance||(c.instance=new c),c.instance}getDefaultConfig(){return{id:"user-default",themeMode:"System",fontFamily:"New York",fontSize:18,lineHeight:1.35,paragraphSpacing:10,motionBlurIntensity:.05,showReflections:!1,rsvpSpeed:200,hasCustomSpeed:!1,rsvpChunkSize:1,isRSVPContextEnabled:!0,rsvpColorHighlight:"#FF3B30"}}loadFromStorage(){try{const t=localStorage.getItem(this.STORAGE_KEY);if(t){const e=JSON.parse(t),s={...this.getDefaultConfig(),...e};return s.hasCustomSpeed||(s.rsvpSpeed=200),s}}catch(t){console.warn("[TitanSettings] Failed to load config",t)}return this.getDefaultConfig()}saveToStorage(){try{localStorage.setItem(this.STORAGE_KEY,JSON.stringify(this.config))}catch(t){console.warn("[TitanSettings] Failed to save config",t)}}getSettings(){return{...this.config}}updateSettings(t){this.config={...this.config,...t},this.saveToStorage(),this.notify()}subscribe(t){return this.listeners.add(t),()=>this.listeners.delete(t)}notify(){this.listeners.forEach(t=>t())}}const M=()=>{const u=c.getInstance(),[t,e]=w.useState(u.getSettings());return w.useEffect(()=>{const s=()=>e(u.getSettings());return u.subscribe(s)},[]),{settings:t,updateSettings:s=>u.updateSettings(s)}};class I{static pulse(t){if(typeof navigator>"u"||!navigator.vibrate)return;const e=t.punctuation||"";if(/[.?!]/.test(e)){navigator.vibrate(15);return}if(/[,;:]/.test(e)){navigator.vibrate(5);return}}static impactMedium(){typeof navigator<"u"&&navigator.vibrate&&navigator.vibrate(20)}static impactLight(){typeof navigator<"u"&&navigator.vibrate&&navigator.vibrate(5)}static selectionChanged(){typeof navigator<"u"&&navigator.vibrate&&navigator.vibrate(3)}}const k=new Set([".","!","?","…","‽"]),x=new Set([";",":","—","–"]);class p{constructor(){this.tokens=[],this.currentIndex=0,this.wpm=150,this.rampStep=3,this.sentenceBoostEnabled=!0,this.wordsInCurrentSentence=0,this._isPlaying=!1,this.animationFrameId=null,this.lastFrameTime=0,this.accumulatedTime=0,this.listeners=new Set,this.completionListeners=new Set,this.notifyScheduled=!1,this.loop=t=>{if(!this._isPlaying)return;if(this.lastFrameTime===0){this.lastFrameTime=t,this.animationFrameId=requestAnimationFrame(this.loop);return}const e=(t-this.lastFrameTime)/1e3;this.lastFrameTime=t;const s=Math.min(e,.1);this.accumulatedTime+=s;const i=this.currentToken;if(!i){this.finish();return}const r=60/this.wpm;let n=1;this.rampStep===0?n=2:this.rampStep===1?n=1.5:this.rampStep===2&&(n=1.2);let l=1;if(this.sentenceBoostEnabled&&i.originalText){const h=i.originalText,a=h.length>0?h.charAt(h.length-1):"",g=h.length>1?h.charAt(h.length-2):"",b=k.has(a)||a==='"'&&k.has(g)||a==="'"&&k.has(g)||a==="”"&&k.has(g)||a==="’"&&k.has(g),T=x.has(a);b?(l=1+.3*Math.max(1,this.wpm/200),this.wordsInCurrentSentence=0):T?l=1.15:this.wordsInCurrentSentence++}const o=r*i.durationMultiplier*n*l;this.accumulatedTime>=o&&(this.advance(),this.accumulatedTime-=o),this._isPlaying&&(this.animationFrameId=requestAnimationFrame(this.loop))}}static getInstance(){return p.instance||(p.instance=new p),p.instance}get currentToken(){return this.currentIndex>=0&&this.currentIndex<this.tokens.length?this.tokens[this.currentIndex]:null}get isPlaying(){return this._isPlaying}setTokens(t){this.tokens=t,this.currentIndex>=t.length&&(this.currentIndex=0),this.notify()}clear(){this.pause(),this.tokens=[],this.currentIndex=0,this.notify()}play(){this._isPlaying||this.tokens.length!==0&&(this.currentIndex>=this.tokens.length-1&&(this.currentIndex=0),this._isPlaying=!0,this.lastFrameTime=0,this.accumulatedTime=0,this.currentIndex===0&&(this.rampStep=0),this.loop(performance.now()),this.notify())}pause(){this._isPlaying&&(this._isPlaying=!1,this.animationFrameId!==null&&(cancelAnimationFrame(this.animationFrameId),this.animationFrameId=null),this.notify())}stop(){this.pause(),this.accumulatedTime=0,this.rampStep=3,this.animationFrameId&&(cancelAnimationFrame(this.animationFrameId),this.animationFrameId=null),this.notify()}toggle(){this._isPlaying?this.pause():this.play()}seek(t){const e=this._isPlaying;e&&this.pause(),this.currentIndex=Math.max(0,Math.min(t,this.tokens.length-1)),this.accumulatedTime=0,this.notify(),e&&this.play()}updateWPM(t){this.wpm=Math.max(50,Math.min(2e3,t)),this.notify()}advance(){this.currentIndex<this.tokens.length-1?(this.currentIndex++,this.rampStep<3&&this.rampStep++,this.notify()):this.finish()}finish(){this.pause(),this.currentIndex=this.tokens.length-1,this.notify(),this.completionListeners.forEach(t=>t())}subscribe(t){return this.listeners.add(t),()=>this.listeners.delete(t)}onComplete(t){return this.completionListeners.add(t),()=>this.completionListeners.delete(t)}notify(){this._isPlaying&&!this.notifyScheduled?(this.notifyScheduled=!0,queueMicrotask(()=>{this.notifyScheduled=!1,this.listeners.forEach(t=>t())})):this._isPlaying||this.listeners.forEach(t=>t())}}const P=`
self.onmessage = function(e) {
    const { text, startingIndex } = e.data;
    const tokens = [];
    let currentTokenIndex = startingIndex;
    
    // ═════════════════════════════════════════════════════════════════════════
    // WORD SETS (Inlined for worker)
    // ═════════════════════════════════════════════════════════════════════════
    
    const FUNCTION_WORDS = new Set([
      'a', 'an', 'the', 'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours',
      'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
      'it', 'its', 'they', 'them', 'their', 'theirs', 'this', 'that', 'these', 'those',
      'who', 'whom', 'whose', 'which', 'what', 'at', 'by', 'for', 'from', 'in', 'of',
      'on', 'to', 'with', 'about', 'after', 'before', 'between', 'into', 'through',
      'during', 'above', 'below', 'under', 'over', 'behind', 'beside', 'beyond',
      'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
      'must', 'can', 'could', 'and', 'or', 'but', 'nor', 'so', 'yet', 'as', 'if',
      'then', 'than', 'when', 'while', 'where', 'there', 'here', 'not', "n't", 'no',
      'yes', 'very', 'just', 'only', 'also', 'even', 'still', 'too'
    ]);
    
    const CLAUSE_STARTERS = new Set([
      'although', 'because', 'before', 'after', 'unless', 'until', 'while',
      'whereas', 'whenever', 'wherever', 'whether', 'though', 'since',
      'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
      'meanwhile', 'otherwise', 'consequently', 'accordingly'
    ]);
    
    const EMPHASIS_WORDS = new Set([
      'never', 'always', 'absolutely', 'definitely', 'certainly', 'surely',
      'suddenly', 'finally', 'immediately', 'instantly', 'important', 'critical',
      'crucial', 'essential', 'significant', 'amazing', 'incredible', 'extraordinary',
      'remarkable', 'astonishing', 'terrible', 'horrible', 'devastating',
      'catastrophic', 'beautiful', 'gorgeous', 'magnificent', 'stunning',
      'first', 'second', 'third', 'lastly'
    ]);
    
    const PUNCT_PAUSES = {
      '.': 1.4, '?': 1.5, '!': 1.3, ';': 0.9, ':': 0.8, ',': 0.35,
      '\\u2014': 0.6, '\\u2013': 0.4, '-': 0.1, '"': 0.25, "'": 0.15, '\\u201C': 0.25,
      '\\u201D': 0.25, '\\u2018': 0.15, '\\u2019': 0.15, '(': 0.2, ')': 0.3, '\\u2026': 1.8
    };
    
    // ═════════════════════════════════════════════════════════════════════════
    // STATE TRACKING
    // ═════════════════════════════════════════════════════════════════════════
    
    let sentencePosition = 0;
    let quoteDepth = 0;
    let prevPunctuation = '';
    
    // ═════════════════════════════════════════════════════════════════════════
    // DURATION CALCULATOR (Inlined)
    // ═════════════════════════════════════════════════════════════════════════
    
    function calcDuration(word, punct, prevPunct, sentPos, isDialogue) {
        const lowerWord = word.toLowerCase();
        const len = word.length;
        let dur = 1.0;
        
        // Estimate syllables using proven syllable count algorithm
        // (correlates strongly with reading time)
        const syllables = estimateSyllables(word);
        
        // Syllable-based timing (more reliable than character length)
        // Most English words: ~1-2 syllables, average 1.5
        // 1 syllable = 0.85x (faster), 2 syllables = 1.0x (normal), 3+ = 1.0 + 0.2*(n-2)
        if (syllables <= 1) dur *= 0.85;
        else if (syllables === 2) dur *= 1.0;
        else if (syllables >= 3) dur *= (1.0 + (syllables - 2) * 0.2);
        
        // Category-based adjustments (these still apply)
        if (FUNCTION_WORDS.has(lowerWord)) dur *= 0.85;
        if (EMPHASIS_WORDS.has(lowerWord)) dur *= 1.15;
        if (sentPos === 0) dur *= 1.1;
        if (CLAUSE_STARTERS.has(lowerWord)) dur *= 1.05;
        
        // Punctuation (critical for natural pacing)
        if (punct) {
            let pPause = 0;
            for (let c of punct) {
                pPause += PUNCT_PAUSES[c] || 0;
            }
            if (punct.includes('...') || punct.includes('…')) pPause = Math.max(pPause, 1.5);
            dur += Math.min(pPause, 2.0);
        }
        
        // Dialogue pacing (slightly faster)
        if (isDialogue) dur *= 0.92;
        
        // Special patterns
        if (/d/.test(word)) dur *= 1.15;  // Numbers take longer to parse
        if (word === word.toUpperCase() && len > 1 && /[A-Z]/.test(word)) dur *= 1.1;
        if (word.includes('-') && len > 5) dur *= 1.05;  // Hyphenated words
        if (word.includes("'") && len < 8) dur *= 0.9;   // Contractions
        
        return Math.max(0.5, Math.min(3.5, dur));
    }
    
    // Syllable counter using proven linguistics algorithm
    // Accuracy ~82% on English text (good enough for timing)
    function estimateSyllables(word) {
        word = word.toLowerCase().replace(/[^a-z]/g, '');
        if (!word) return 1;
        if (word.length <= 3) return 1;
        
        let count = 0;
        let prevWasVowel = false;
        const vowels = 'aeiouy';
        
        for (let i = 0; i < word.length; i++) {
            const isVowel = vowels.includes(word[i]);
            if (isVowel && !prevWasVowel) {
                count++;
            }
            prevWasVowel = isVowel;
        }
        
        // Adjustments for silent 'e' and other patterns
        if (word.endsWith('e')) count--;
        if (word.endsWith('le') && word.length > 2 && !vowels.includes(word[word.length - 3])) count++;
        if (count === 0) count = 1;
        
        return Math.max(1, count);
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // PROCESSING LOOP
    // ═════════════════════════════════════════════════════════════════════════
    
    const CHUNK_SIZE = 10000;
    let match;
    const regex = /([^\\s]+)(\\s*)/g;
    const punctuationRegex = /^(.+?)([.,;:!?"')\\]}\\u201C\\u201D\\u2018\\u2019\\u00BB\\u203A\\u2026\\u2014\\u2013-]+)?$/;
    const sentenceEndRegex = /[.?!\\u2026]/;
    const quoteChars = new Set(['"', '\\u201C', '\\u201D', '\\u2018', '\\u2019', "'", '\\u00AB', '\\u00BB']);
    
    function calculateORP(len) {
        if (len <= 1) return 0;
        if (len >= 2 && len <= 5) return 1;
        if (len >= 6 && len <= 10) return 2;
        return 3;
    }
    
    function processChunk() {
        let count = 0;
        
        while (count < CHUNK_SIZE) {
            match = regex.exec(text);
            if (!match) break;
            
            const fullChunk = match[1];
            const trailingSpace = match[2];
            const matchIndex = match.index;
            
            const separationMatch = fullChunk.match(punctuationRegex);
            let wordContent = fullChunk;
            let punctuationStr = "";
            
            if (separationMatch) {
                wordContent = separationMatch[1];
                punctuationStr = separationMatch[2] || "";
            }
            
            const len = wordContent.length;
            const orpIndex = (len <= 10) ? calculateORP(len) : 3;
            const leftSegment = wordContent.slice(0, orpIndex);
            const centerCharacter = wordContent[orpIndex] || "";
            const rightSegment = wordContent.slice(orpIndex + 1);
            
            // Update quote depth for dialogue tracking
            let isDialogue = quoteDepth > 0;
            for (let c of fullChunk) {
                if (c === '"' || c === '\\u201C' || c === '\\u00AB') quoteDepth++;
                else if (c === '"' || c === '\\u201D' || c === '\\u00BB') quoteDepth = Math.max(0, quoteDepth - 1);
            }
            
            // Calculate grammar-aware duration
            const duration = calcDuration(
                wordContent, 
                punctuationStr, 
                prevPunctuation,
                sentencePosition,
                isDialogue
            );
            
            // Track sentence position
            const isSentenceEnd = sentenceEndRegex.test(punctuationStr);
            if (isSentenceEnd) {
                sentencePosition = 0;
            } else {
                sentencePosition++;
            }
            prevPunctuation = punctuationStr;
            
            const isParagraphEnd = trailingSpace.indexOf('\\n') !== -1;
            
            // Add paragraph pause
            let finalDuration = duration;
            if (isParagraphEnd) finalDuration += 1.8;
            
            tokens.push({
                id: 't-' + currentTokenIndex,
                originalText: fullChunk,
                leftSegment,
                centerCharacter,
                rightSegment,
                punctuation: punctuationStr || undefined,
                durationMultiplier: finalDuration,
                isSentenceEnd,
                isParagraphEnd,
                globalIndex: currentTokenIndex,
                startOffset: matchIndex
            });
            
            currentTokenIndex++;
            count++;
        }
        
        if (!match) {
            self.postMessage(tokens);
        } else {
            setTimeout(processChunk, 0);
        }
    }
    
    processChunk();
};
`,v=P,d=class d{static initWorker(){if(!this.worker)try{const t=new Blob([v],{type:"application/javascript"});this.workerUrl=URL.createObjectURL(t),this.worker=new Worker(this.workerUrl),this.worker.onmessage=e=>{const s=e.data;this.isProcessing=!1,this.pendingResolve&&(this.pendingResolve(s),this.pendingResolve=null,this.pendingReject=null)},this.worker.onerror=e=>{console.error("RSVP Worker Error",e),this.isProcessing=!1,this.pendingReject&&(this.pendingReject(e),this.pendingResolve=null,this.pendingReject=null),this.terminate()}}catch(t){console.error("Failed to initialize RSVP Worker",t)}}static async process(t,e=0){return this.isProcessing&&this.pendingReject&&(this.pendingReject(new Error("Cancelled by new process request")),this.pendingResolve=null,this.pendingReject=null,this.terminate()),this.worker||this.initWorker(),new Promise((s,i)=>{this.pendingResolve=s,this.pendingReject=i,this.isProcessing=!0,this.worker?this.worker.postMessage({text:t,startingIndex:e}):i(new Error("Worker failed to initialize"))})}static terminate(){this.worker&&(this.worker.terminate(),this.worker=null),this.workerUrl&&(URL.revokeObjectURL(this.workerUrl),this.workerUrl=null),this.isProcessing=!1,this.pendingResolve=null,this.pendingReject=null}static cleanup(){this.terminate()}};d.worker=null,d.workerUrl=null,d.pendingResolve=null,d.pendingReject=null,d.isProcessing=!1;let y=d;class f{constructor(){this.state="IDLE",this.listeners=new Set,this.lastSavedIndex=-1,this.lastContentRef=null,this.preparationPromise=null,this.wakeLock=null,this.notifyScheduled=!1,this.heartbeat=p.getInstance(),this.core=m.getInstance(),this.heartbeat.subscribe(()=>this.handleHeartbeatUpdate()),this.heartbeat.onComplete(()=>{this.state="FINISHED",this.releaseWakeLock(),this.notify()});const t=c.getInstance(),e=t.getSettings().rsvpSpeed;this.updateWPM(e),t.subscribe(()=>{const s=t.getSettings().rsvpSpeed;this.heartbeat.wpm!==s&&this.updateWPM(s)}),document.addEventListener("visibilitychange",async()=>{this.wakeLock!==null&&document.visibilityState==="visible"&&this.state==="PLAYING"&&await this.requestWakeLock()})}static getInstance(){return f.instance||(f.instance=new f),f.instance}async prepare(t,e={}){if(this.lastContentRef===t&&this.heartbeat.tokens.length>0){this.applyConfig(e);return}if(this.preparationPromise)try{if(await this.preparationPromise,this.lastContentRef===t){this.applyConfig(e);return}}catch{}this.preparationPromise=(async()=>{try{const s=await y.process(t);this.heartbeat.setTokens(s),this.lastContentRef=t}finally{this.preparationPromise=null}})(),await this.preparationPromise,this.applyConfig(e)}applyConfig(t){const e=this.heartbeat.tokens;let s=0;if(t.index!==void 0)s=Math.max(0,Math.min(t.index,e.length-1));else if(t.offset!==void 0){const i=t.offset,r=e.findIndex(n=>n.startOffset>=i);r!==-1?s=r:s=Math.max(0,e.length-1)}else{const i=t.progress??0;s=Math.max(0,Math.min(Math.floor(e.length*i),e.length-1))}this.heartbeat.seek(s),this.state="PAUSED",this.lastSavedIndex=s,this.notify()}togglePlay(){this.state==="PLAYING"?this.pause():this.play()}play(){this.state==="FINISHED"&&(this.heartbeat.seek(0),this.state="PAUSED",I.impactMedium()),this.heartbeat.tokens.length!==0&&(this.state="PLAYING",this.heartbeat.play(),this.requestWakeLock(),this.notify())}pause(t=!1){if(this.state="PAUSED",this.heartbeat.pause(),this.releaseWakeLock(),!t){const e=this.heartbeat.currentIndex,i=Math.max(0,e-1);i!==e&&this.heartbeat.seek(i)}this.syncProgressToCore(!0),this.notify()}seekRelative(t){const e=this.heartbeat.currentIndex,s=e+t;s!==e&&(this.state==="PLAYING"&&this.pause(!0),this.heartbeat.seek(s),this.syncProgressToCore(!0))}shutdown(t=!0){t&&this.syncProgressToCore(!0),this.heartbeat.stop(),this.state="IDLE",this.releaseWakeLock(),this.lastContentRef=null,this.heartbeat.clear(),this.notify()}updateWPM(t){this.heartbeat.updateWPM(t)}async requestWakeLock(){if("wakeLock"in navigator)try{this.wakeLock=await navigator.wakeLock.request("screen")}catch(t){console.warn("Wake Lock request failed:",t)}}releaseWakeLock(){this.wakeLock&&this.wakeLock.release().then(()=>{this.wakeLock=null}).catch(t=>console.error(t))}handleHeartbeatUpdate(){!this.heartbeat.isPlaying&&this.state==="PLAYING"&&(this.state="PAUSED",this.releaseWakeLock());const t=this.heartbeat.currentIndex;Math.abs(t-this.lastSavedIndex)>=100&&(this.syncProgressToCore(),this.lastSavedIndex=t),this.notify()}syncProgressToCore(t=!1){if(this.heartbeat.tokens.length===0)return;const s=this.heartbeat.currentToken,i=this.heartbeat.currentIndex;s?this.core.syncFromRSVP(s.startOffset,i):i>0&&this.core.saveProgress(i)}subscribe(t){return this.listeners.add(t),()=>this.listeners.delete(t)}notify(){this.notifyScheduled||(this.notifyScheduled=!0,queueMicrotask(()=>{this.notifyScheduled=!1,this.listeners.forEach(t=>t())}))}}class C{constructor(){this._content="",this.attributes={},this.layoutManagers=[]}get string(){return this._content}set string(t){this._content=t}addLayoutManager(t){this.layoutManagers.push(t)}}class L{constructor(t){this.widthTracksTextView=!1,this.heightTracksTextView=!1,this.lineFragmentPadding=5,this.size=t}}class S{constructor(t){this.textContainers=[],this.id=t}addTextContainer(t){this.textContainers.push(t)}enumerateTextSegments(t,e,s){s({x:0,y:0,width:0,height:0})}}class m{constructor(){this.listeners=new Set,this.jumpListeners=new Set,this.offsetJumpListeners=new Set,this.progressListeners=new Set,this.isLoading=!1,this.loadingProgress=0,this.currentBook=null,this.currentProgress=0,this.isRSVPMode=!1,this.globalCharacterOffset=0,this.userSelectionOffset=null,this.totalTokens=1,this.chapterTokenOffsets=[],this._loadTimestamp=0,this._lastSavedTokenIndex=-1,this._userIntentionalRewind=!1,this.contentStorage=new C,this.primaryLayout=new S("primary"),this.ghostLayout=new S("ghost"),this.configurePipeline(),c.getInstance().subscribe(()=>this.updateTypography())}static getInstance(){return m.instance||(m.instance=new m),m.instance}configurePipeline(){this.contentStorage.addLayoutManager(this.primaryLayout),this.contentStorage.addLayoutManager(this.ghostLayout)}async load(t){this._loadTimestamp=Date.now(),this._lastSavedTokenIndex=-1,this._userIntentionalRewind=!1,this.isLoading=!0,this.loadingProgress=.1,this.notify();const e={...t};if(this.currentBook?.id===t.id&&this.contentStorage.string.length>0){let s=e.lastTokenIndex;try{const i=`book_progress_${t.id}`,r=localStorage.getItem(i);if(r){const n=JSON.parse(r);n.lastTokenIndex!==void 0&&(s===void 0||n.lastTokenIndex>s)&&(s=n.lastTokenIndex)}}catch(i){console.warn("[TitanCore] Failed to restore from localStorage backup:",i)}s!==void 0&&(this.currentBook.lastTokenIndex=s,this.totalTokens>0&&(this.currentProgress=Math.min(1,s/this.totalTokens))),this.currentBook.bookmarkProgress=this.currentProgress,this._lastSavedTokenIndex=this.currentBook.lastTokenIndex||0,this.isLoading=!1,this.loadingProgress=1,this.notify();return}this.unload();try{const s=e.chapters?[...e.chapters]:[];s.sort((o,h)=>o.sortOrder-h.sortOrder);const i=s.length;if(i===0){this.isLoading=!1,this.loadingProgress=1,this.notify();return}this.chapterTokenOffsets=[];const r=new Array(i);let n=0;for(let o=0;o<i;o++){const a=(s[o].content||"").replace(/<[^>]*>/g," ").replace(/&[a-z]+;/gi," ").replace(/\s+/g," ").trim();r[o]=a;const g=a?a.split(/\s+/).length:0;this.chapterTokenOffsets.push(n),n+=g}this.totalTokens=Math.max(1,n),this.contentStorage.string=r.join(`

`),this.currentBook=e;let l=e.lastTokenIndex;try{const o=`book_progress_${e.id}`,h=localStorage.getItem(o);if(h){const a=JSON.parse(h);a.lastTokenIndex!==void 0&&(l===void 0||a.lastTokenIndex>l)&&(l=a.lastTokenIndex,console.log("[TitanCore] Restored progress from localStorage backup"))}}catch(o){console.warn("[TitanCore] Failed to restore from localStorage backup:",o)}l!==void 0?(this.currentBook.lastTokenIndex=l,this.currentProgress=Math.min(1,l/this.totalTokens)):(this.currentProgress=e.bookmarkProgress||0,this.currentProgress>0&&(this.currentBook.lastTokenIndex=Math.floor(this.currentProgress*this.totalTokens))),this.currentBook.bookmarkProgress=this.currentProgress,this._lastSavedTokenIndex=this.currentBook.lastTokenIndex||0,this.updateTypography(),this.isLoading=!1,this.loadingProgress=1,this.notify(),requestIdleCallback?.(()=>{f.getInstance().prepare(this.contentStorage.string).catch(()=>{})})||setTimeout(()=>{f.getInstance().prepare(this.contentStorage.string).catch(()=>{})},100)}catch(s){console.error("[TitanCore] Error:",s),this.isLoading=!1,this.loadingProgress=1,this.notify()}}unload(){this.currentBook=null,this.contentStorage.string="",this.userSelectionOffset=null,this.isRSVPMode=!1,this.totalTokens=1,this.chapterTokenOffsets=[],this._lastSavedTokenIndex=-1,this._userIntentionalRewind=!1}updateTypography(){const t=c.getInstance().getSettings();let e='"New York Extra Large", "Times New Roman", serif';t.fontFamily==="SF Pro"&&(e='"SF Pro Rounded", -apple-system, sans-serif'),t.fontFamily==="OpenDyslexic"&&(e='"OpenDyslexic", "Comic Sans MS", sans-serif'),t.fontFamily==="Atkinson Hyperlegible"&&(e='"Atkinson Hyperlegible", sans-serif');const s=t.fontSize<18?"500":t.fontSize>32?"300":"400";this.contentStorage.attributes={fontFamily:e,fontSize:`${t.fontSize}px`,lineHeight:`${t.lineHeight}`,paragraphSpacing:`${t.paragraphSpacing}px`,letterSpacing:"0.2px",fontWeight:s,color:"inherit"},this.notify()}updateLayout(t){this.primaryLayout.textContainers=[];const e=new L(t);e.widthTracksTextView=!0,this.primaryLayout.addTextContainer(e),this.notify()}saveProgress(t,e=!1){if(!this.currentBook||typeof t!="number"||t<0||t===this._lastSavedTokenIndex&&!e)return;e&&t===0&&(this._userIntentionalRewind=!0);const s=Date.now()-this._loadTimestamp,i=this.currentBook.lastTokenIndex||0;if(t===0&&i>50&&s<3e3&&!this._userIntentionalRewind)return;this._lastSavedTokenIndex=t,this.currentBook.lastTokenIndex=t;let r=0;this.totalTokens>0&&(r=t/this.totalTokens),(isNaN(r)||!isFinite(r))&&(r=0),this.currentProgress=Math.min(1,Math.max(0,r)),this.currentBook.bookmarkProgress=this.currentProgress,this.currentBook.lastOpened=new Date,this.currentProgress>=.99&&(this.currentBook.isFinished=!0),this.progressListeners.forEach(n=>n(this.currentProgress)),this.notify();try{const n=`book_progress_${this.currentBook.id}`;localStorage.setItem(n,JSON.stringify({lastTokenIndex:t,bookmarkProgress:this.currentProgress,timestamp:Date.now()}))}catch(n){console.warn("[TitanCore] localStorage backup failed:",n)}}restorePosition(t,e){return 0}jump(t){if(this.currentProgress=Math.max(0,Math.min(1,t)),this.currentBook&&this.totalTokens>0){const e=Math.floor(t*this.totalTokens);this.currentBook.lastTokenIndex=e,this.currentBook.bookmarkProgress=this.currentProgress,this.jumpListeners.forEach(s=>s(t)),this.progressListeners.forEach(s=>s(t))}this.notify()}jumpToChapter(t){if(t<0||t>=this.chapterTokenOffsets.length)return;const e=this.chapterTokenOffsets[t];t===0&&(this._userIntentionalRewind=!0),this.currentBook.lastTokenIndex=e,this.totalTokens>0&&(this.currentProgress=e/this.totalTokens,this.currentBook.bookmarkProgress=this.currentProgress),this.jumpListeners.forEach(s=>s(this.currentProgress)),this.progressListeners.forEach(s=>s(this.currentProgress)),this.notify()}syncFromRSVP(t,e){this.globalCharacterOffset=t,this.saveProgress(e),this.offsetJumpListeners.forEach(s=>s(t))}selectText(t){this.userSelectionOffset=t,this.notify()}onJump(t){return this.jumpListeners.add(t),()=>this.jumpListeners.delete(t)}onOffsetJump(t){return this.offsetJumpListeners.add(t),()=>this.offsetJumpListeners.delete(t)}onProgress(t){return this.progressListeners.add(t),()=>this.progressListeners.delete(t)}rectForRange(t){return null}subscribe(t){return this.listeners.add(t),()=>this.listeners.delete(t)}notify(){this.listeners.forEach(t=>t())}}export{I as R,c as T,m as a,M as u};
