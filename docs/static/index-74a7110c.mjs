import{m as I,n as y,p as Y,q as Z,s as U,v as W,x as ee,y as $,z as j,_ as D,o as S,c as C,a as d,A as te,B as re,d as q,C as ne,t as B,l as ae,u as oe,D as se,E as ie,G as ce,i as E,H as ue,j as R,S as le}from"./entry-549bf2e9.mjs";const fe=e=>I(e)?e:y(e),de=()=>null;function _e(e,a,n={}){var f,h,O,x,A;if(typeof e!="string")throw new TypeError("asyncData key must be a string");if(typeof a!="function")throw new TypeError("asyncData handler must be a function");n={server:!0,default:de,...n},n.defer&&console.warn("[useAsyncData] `defer` has been renamed to `lazy`. Support for `defer` will be removed in RC."),n.lazy=(h=(f=n.lazy)!=null?f:n.defer)!=null?h:!1,n.initialCache=(O=n.initialCache)!=null?O:!0;const t=Y(),r=ee();if(r&&!r._nuxtOnBeforeMountCbs){const _=r._nuxtOnBeforeMountCbs=[];r&&(Z(()=>{_.forEach(l=>{l()}),_.splice(0,_.length)}),U(()=>_.splice(0,_.length)))}const o=()=>n.initialCache&&t.payload.data[e]!==void 0,s={data:fe((x=t.payload.data[e])!=null?x:n.default()),pending:y(!o()),error:y((A=t.payload._errors[e])!=null?A:null)};s.refresh=(_={})=>t._asyncDataPromises[e]?t._asyncDataPromises[e]:_._initial&&o()?t.payload.data[e]:(s.pending.value=!0,t._asyncDataPromises[e]=Promise.resolve(a(t)).then(l=>{n.transform&&(l=n.transform(l)),n.pick&&(l=pe(l,n.pick)),s.data.value=l,s.error.value=null}).catch(l=>{s.error.value=l,s.data.value=$(n.default())}).finally(()=>{s.pending.value=!1,t.payload.data[e]=s.data.value,s.error.value&&(t.payload._errors[e]=!0),delete t._asyncDataPromises[e]}),t._asyncDataPromises[e]);const i=()=>s.refresh({_initial:!0}),c=n.server!==!1&&t.payload.serverRendered;{c&&t.isHydrating&&e in t.payload.data?s.pending.value=!1:r&&t.payload.serverRendered&&(t.isHydrating||n.lazy)?r._nuxtOnBeforeMountCbs.push(i):i(),n.watch&&W(n.watch,()=>s.refresh());const _=t.hook("app:data:refresh",l=>{if(!l||l.includes(e))return s.refresh()});r&&U(_)}const u=Promise.resolve(t._asyncDataPromises[e]).then(()=>s);return Object.assign(u,s),u}function pe(e,a){const n={};for(const t of a)n[t]=e[t];return n}function he(e,a=0){typeof e=="string"&&(e=me(e));let n=0,t=a,r,o;const s=e.length&3,i=e.length-s,c=3432918353,u=461845907;for(;n<i;)r=e[n]&255|(e[++n]&255)<<8|(e[++n]&255)<<16|(e[++n]&255)<<24,++n,r=(r&65535)*c+(((r>>>16)*c&65535)<<16)&4294967295,r=r<<15|r>>>17,r=(r&65535)*u+(((r>>>16)*u&65535)<<16)&4294967295,t^=r,t=t<<13|t>>>19,o=(t&65535)*5+(((t>>>16)*5&65535)<<16)&4294967295,t=(o&65535)+27492+(((o>>>16)+58964&65535)<<16);switch(r=0,s){case 3:r^=(e[n+2]&255)<<16;break;case 2:r^=(e[n+1]&255)<<8;break;case 1:r^=e[n]&255,r=(r&65535)*c+(((r>>>16)*c&65535)<<16)&4294967295,r=r<<15|r>>>17,r=(r&65535)*u+(((r>>>16)*u&65535)<<16)&4294967295,t^=r}return t^=e.length,t^=t>>>16,t=(t&65535)*2246822507+(((t>>>16)*2246822507&65535)<<16)&4294967295,t^=t>>>13,t=(t&65535)*3266489909+(((t>>>16)*3266489909&65535)<<16)&4294967295,t^=t>>>16,t>>>0}function me(e){return new TextEncoder().encode(e)}const ye={ignoreUnknown:!1,respectType:!1,respectFunctionNames:!1,respectFunctionProperties:!1,unorderedObjects:!0,unorderedArrays:!1,unorderedSets:!1};function ge(e,a={}){a={...ye,...a};const n=k(a);return n.dispatch(e),n.toString()}function k(e){const a=[];let n=[];const t=r=>{a.push(r)};return{toString(){return a.join("")},getContext(){return n},dispatch(r){return e.replacer&&(r=e.replacer(r)),this["_"+(r===null?"null":typeof r)](r)},_object(r){const o=/\[object (.*)\]/i,s=Object.prototype.toString.call(r),i=o.exec(s),c=i?i[1].toLowerCase():"unknown:["+s.toLowerCase()+"]";let u=null;if((u=n.indexOf(r))>=0)return this.dispatch("[CIRCULAR:"+u+"]");if(n.push(r),typeof Buffer!="undefined"&&Buffer.isBuffer&&Buffer.isBuffer(r))return t("buffer:"),t(r.toString("utf8"));if(c!=="object"&&c!=="function"&&c!=="asyncfunction")if(this["_"+c])this["_"+c](r);else{if(e.ignoreUnknown)return t("["+c+"]");throw new Error('Unknown object type "'+c+'"')}else{let f=Object.keys(r);return e.unorderedObjects&&(f=f.sort()),e.respectType!==!1&&!M(r)&&f.splice(0,0,"prototype","__proto__","letructor"),e.excludeKeys&&(f=f.filter(function(h){return!e.excludeKeys(h)})),t("object:"+f.length+":"),f.forEach(h=>{this.dispatch(h),t(":"),e.excludeValues||this.dispatch(r[h]),t(",")})}},_array(r,o){if(o=typeof o!="undefined"?o:e.unorderedArrays!==!1,t("array:"+r.length+":"),!o||r.length<=1)return r.forEach(c=>this.dispatch(c));const s=[],i=r.map(c=>{const u=k(e);return u.dispatch(c),s.push(u.getContext()),u.toString()});return n=n.concat(s),i.sort(),this._array(i,!1)},_date(r){return t("date:"+r.toJSON())},_symbol(r){return t("symbol:"+r.toString())},_error(r){return t("error:"+r.toString())},_boolean(r){return t("bool:"+r.toString())},_string(r){t("string:"+r.length+":"),t(r.toString())},_function(r){t("fn:"),M(r)?this.dispatch("[native]"):this.dispatch(r.toString()),e.respectFunctionNames!==!1&&this.dispatch("function-name:"+String(r.name)),e.respectFunctionProperties&&this._object(r)},_number(r){return t("number:"+r.toString())},_xml(r){return t("xml:"+r.toString())},_null(){return t("Null")},_undefined(){return t("Undefined")},_regexp(r){return t("regex:"+r.toString())},_uint8array(r){return t("uint8array:"),this.dispatch(Array.prototype.slice.call(r))},_uint8clampedarray(r){return t("uint8clampedarray:"),this.dispatch(Array.prototype.slice.call(r))},_int8array(r){return t("int8array:"),this.dispatch(Array.prototype.slice.call(r))},_uint16array(r){return t("uint16array:"),this.dispatch(Array.prototype.slice.call(r))},_int16array(r){return t("int16array:"),this.dispatch(Array.prototype.slice.call(r))},_uint32array(r){return t("uint32array:"),this.dispatch(Array.prototype.slice.call(r))},_int32array(r){return t("int32array:"),this.dispatch(Array.prototype.slice.call(r))},_float32array(r){return t("float32array:"),this.dispatch(Array.prototype.slice.call(r))},_float64array(r){return t("float64array:"),this.dispatch(Array.prototype.slice.call(r))},_arraybuffer(r){return t("arraybuffer:"),this.dispatch(new Uint8Array(r))},_url(r){return t("url:"+r.toString())},_map(r){t("map:");const o=Array.from(r);return this._array(o,e.unorderedSets!==!1)},_set(r){t("set:");const o=Array.from(r);return this._array(o,e.unorderedSets!==!1)},_file(r){return t("file:"),this.dispatch([r.name,r.size,r.type,r.lastModfied])},_blob(){if(e.ignoreUnknown)return t("[blob]");throw new Error(`Hashing Blob objects is currently not supported
Use "options.replacer" or "options.ignoreUnknown"
`)},_domwindow(){return t("domwindow")},_bigint(r){return t("bigint:"+r.toString())},_process(){return t("process")},_timer(){return t("timer")},_pipe(){return t("pipe")},_tcp(){return t("tcp")},_udp(){return t("udp")},_tty(){return t("tty")},_statwatcher(){return t("statwatcher")},_securecontext(){return t("securecontext")},_connection(){return t("connection")},_zlib(){return t("zlib")},_context(){return t("context")},_nodescript(){return t("nodescript")},_httpparser(){return t("httpparser")},_dataview(){return t("dataview")},_signal(){return t("signal")},_fsevent(){return t("fsevent")},_tlswrap(){return t("tlswrap")}}}function M(e){return typeof e!="function"?!1:/^function\s+\w*\s*\(\s*\)\s*{\s+\[native code\]\s+}$/i.exec(Function.prototype.toString.call(e))!=null}function we(e,a={}){const n=typeof e=="string"?e:ge(e,a);return String(he(n))}function ve(e,a={}){const n="$f_"+(a.key||we([e,{...a,transform:null}])),t=j(()=>{let i=e;return typeof i=="function"&&(i=i()),I(i)?i.value:i}),r={...a,cache:typeof a.cache=="boolean"?void 0:a.cache},o={...a,watch:[t,...a.watch||[]]};return _e(n,()=>$fetch(t.value,r),o)}const xe={},be={"inline-flex":"","text-2xl":"","font-300":"","cursor-default":""},$e=d("div",{flex:"","flex-col":"","children:mx-auto":""},[d("img",{"w-18":"","h-18":"","inline-block":"",src:"/nuxt.png"}),d("span",{"text-green5":"","mt--2":""},"Nuxt 3")],-1),Se=d("div",{text:"3xl gray4",m:"x-4 y-auto","transition-all-500":"",transform:"","hover:rotate-135":"","i-carbon-add":""},null,-1),Oe=d("div",{flex:"","flex-col":"","children:mx-auto":""},[d("img",{"w-18":"","h-18":"","inline-block":"",src:"/vite.png"}),d("span",{"text-purple5":"","mt--2":""},"Vitesse")],-1),Ae=[$e,Se,Oe];function Pe(e,a){return S(),C("div",be,Ae)}var De=D(xe,[["render",Pe]]),V;const g=typeof window!="undefined";g&&((V=window==null?void 0:window.navigator)==null?void 0:V.userAgent)&&/iP(ad|hone|od)/.test(window.navigator.userAgent);function N(e){return te()?(re(e),!0):!1}function Ce(e,a=1e3,n={}){const{immediate:t=!0,immediateCallback:r=!1}=n;let o=null;const s=y(!1);function i(){o&&(clearInterval(o),o=null)}function c(){s.value=!1,i()}function u(){$(a)<=0||(s.value=!0,r&&e(),i(),o=setInterval(e,$(a)))}if(t&&g&&u(),I(a)){const f=W(a,()=>{s.value&&g&&u()});N(f)}return N(c),{isActive:s,pause:c,resume:u}}const Ee=g?window:void 0;g&&window.document;g&&window.navigator;g&&window.location;const T=typeof globalThis!="undefined"?globalThis:typeof window!="undefined"?window:typeof global!="undefined"?global:typeof self!="undefined"?self:{},F="__vueuse_ssr_handlers__";T[F]=T[F]||{};T[F];function Ne(e,a={}){const{immediate:n=!0,window:t=Ee}=a,r=y(!1);let o=null;function s(){!r.value||!t||(e(),o=t.requestAnimationFrame(s))}function i(){!r.value&&t&&(r.value=!0,s())}function c(){r.value=!1,o!=null&&t&&(t.cancelAnimationFrame(o),o=null)}return n&&i(),N(c),{isActive:r,pause:c,resume:i}}var Te=Object.defineProperty,H=Object.getOwnPropertySymbols,Fe=Object.prototype.hasOwnProperty,Ie=Object.prototype.propertyIsEnumerable,L=(e,a,n)=>a in e?Te(e,a,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[a]=n,je=(e,a)=>{for(var n in a||(a={}))Fe.call(a,n)&&L(e,n,a[n]);if(H)for(var n of H(a))Ie.call(a,n)&&L(e,n,a[n]);return e};function Ue(e={}){const{controls:a=!1,interval:n="requestAnimationFrame"}=e,t=y(new Date),r=()=>t.value=new Date,o=n==="requestAnimationFrame"?Ne(r,{immediate:!0}):Ce(r,n,{immediate:!0});return a?je({now:t},o):t}var z;(function(e){e.UP="UP",e.RIGHT="RIGHT",e.DOWN="DOWN",e.LEFT="LEFT",e.NONE="NONE"})(z||(z={}));var Be=Object.defineProperty,P=Object.getOwnPropertySymbols,J=Object.prototype.hasOwnProperty,Q=Object.prototype.propertyIsEnumerable,K=(e,a,n)=>a in e?Be(e,a,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[a]=n,Re=(e,a)=>{for(var n in a||(a={}))J.call(a,n)&&K(e,n,a[n]);if(P)for(var n of P(a))Q.call(a,n)&&K(e,n,a[n]);return e},Me=(e,a)=>{var n={};for(var t in e)J.call(e,t)&&a.indexOf(t)<0&&(n[t]=e[t]);if(e!=null&&P)for(var t of P(e))a.indexOf(t)<0&&Q.call(e,t)&&(n[t]=e[t]);return n};const G=[{max:6e4,value:1e3,name:"second"},{max:276e4,value:6e4,name:"minute"},{max:72e6,value:36e5,name:"hour"},{max:5184e5,value:864e5,name:"day"},{max:24192e5,value:6048e5,name:"week"},{max:28512e6,value:2592e6,name:"month"},{max:1/0,value:31536e6,name:"year"}],Ve={justNow:"just now",past:e=>e.match(/\d/)?`${e} ago`:e,future:e=>e.match(/\d/)?`in ${e}`:e,month:(e,a)=>e===1?a?"last month":"next month":`${e} month${e>1?"s":""}`,year:(e,a)=>e===1?a?"last year":"next year":`${e} year${e>1?"s":""}`,day:(e,a)=>e===1?a?"yesterday":"tomorrow":`${e} day${e>1?"s":""}`,week:(e,a)=>e===1?a?"last week":"next week":`${e} week${e>1?"s":""}`,hour:e=>`${e} hour${e>1?"s":""}`,minute:e=>`${e} minute${e>1?"s":""}`,second:e=>`${e} second${e>1?"s":""}`},He=e=>e.toISOString().slice(0,10);function Le(e,a={}){const{controls:n=!1,max:t,updateInterval:r=3e4,messages:o=Ve,fullDateFormatter:s=He}=a,{abs:i,round:c}=Math,u=Ue({interval:r,controls:!0}),{now:f}=u,h=Me(u,["now"]);function O(l,m){var w;const p=+m-+l,v=i(p);if(v<6e4)return o.justNow;if(typeof t=="number"&&v>t)return s(new Date(l));if(typeof t=="string"){const b=(w=G.find(X=>X.name===t))==null?void 0:w.max;if(b&&v>b)return s(new Date(l))}for(const b of G)if(v<b.max)return A(p,b)}function x(l,m,w){const p=o[l];return typeof p=="function"?p(m,w):p.replace("{0}",m.toString())}function A(l,m){const w=c(i(l)/m.value),p=l>0,v=x(m.name,w,p);return x(p?"past":"future",v,p)}const _=j(()=>O(new Date($(e)),$(f.value)));return n?Re({timeAgo:_},h):_}const ze=q({__name:"PageView",async setup(e,{expose:a}){a();let n,t;const{data:r}=([n,t]=ne(()=>ve("/api/pageview")),n=await n,t(),n),o=Le(j(()=>r.value.startAt)),s={data:r,time:o};return Object.defineProperty(s,"__isScriptSetup",{enumerable:!1,value:!0}),s}}),Ke={"text-gray:80":""},Ge={"font-500":"","text-gray":""},We=ae(" page views since "),qe={"text-gray":""};function ke(e,a,n,t,r,o){return S(),C("div",Ke,[d("span",Ge,B(t.data.pageview),1),We,d("span",qe,B(t.time),1)])}var Je=D(ze,[["render",ke]]);const Qe=q({__name:"InputEntry",setup(e,{expose:a}){a();const n=y(""),t=oe(),o={name:n,router:t,go:()=>{n.value&&t.push(`/hi/${encodeURIComponent(n.value)}`)}};return Object.defineProperty(o,"__isScriptSetup",{enumerable:!1,value:!0}),o}}),Xe=["onKeydown"],Ye=["disabled"];function Ze(e,a,n,t,r,o){return S(),C("div",null,[se(d("input",{id:"input","onUpdate:modelValue":a[0]||(a[0]=s=>t.name=s),placeholder:"What's your name?",type:"text",autocomplete:"off",p:"x-4 y-2",m:"t-5",w:"250px",text:"center",bg:"transparent",border:"~ rounded gray-200 dark:gray-700",outline:"none active:none",onKeydown:ce(t.go,["enter"])},null,40,Xe),[[ie,t.name]]),d("div",null,[d("button",{"m-3":"","text-sm":"",btn:"",disabled:!t.name,onClick:t.go}," GO ",8,Ye)])])}var et=D(Qe,[["render",Ze]]);const tt={},rt=d("div",{op50:"",italic:""},[d("span",{"animate-pulse":""},"Loading...")],-1);function nt(e,a){const n=De,t=Je,r=et;return S(),C("div",null,[E(n,{"mb-6":""}),(S(),ue(le,null,{fallback:R(()=>[rt]),default:R(()=>[E(t)]),_:1})),E(r)])}var ot=D(tt,[["render",nt]]);export{ot as default};