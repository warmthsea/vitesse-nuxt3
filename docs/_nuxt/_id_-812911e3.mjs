import{b,_ as p,d as f,o as _,c,a as n,t as l,e as k,f as $,w as C,r as w,F as y,g as N,h as S,i as d,j as m,k as g,l as h}from"./entry-733d7888.mjs";function j(){const s=b("count",()=>Math.round(Math.random()*20));function e(){s.value+=1}function o(){s.value-=1}return{count:s,inc:e,dec:o}}const B=f({__name:"Counter",setup(s,{expose:e}){e();const{count:o,inc:t,dec:a}=j(),r={count:o,inc:t,dec:a};return Object.defineProperty(r,"__isScriptSetup",{enumerable:!1,value:!0}),r}}),V={"inline-flex":"",m:"y-3"},E=n("div",{"i-carbon-subtract":""},null,-1),F=[E],L={font:"mono",w:"15","m-auto":"","inline-block":""},M=n("div",{"i-carbon-add":""},null,-1),O=[M];function P(s,e,o,t,a,r){return _(),c("div",V,[n("button",{btn:"","p-2":"","rounded-full":"",onClick:e[0]||(e[0]=i=>t.dec())},F),n("div",L,l(t.count),1),n("button",{btn:"","p-2":"","rounded-full":"",onClick:e[1]||(e[1]=i=>t.inc())},O)])}var A=p(B,[["render",P]]);const D=f({__name:"[id]",setup(s,{expose:e}){e();const o=k(),t=$(),a=o.params.id;C(()=>{t.setNewName(o.params.id)});const r={route:o,user:t,name:a};return Object.defineProperty(r,"__isScriptSetup",{enumerable:!1,value:!0}),r}}),H=n("div",{"i-twemoji:waving-hand":"","text-4xl":"","inline-block":"","animate-shake-x":"","animate-duration-5000":""},null,-1),R=n("h3",{"text-2xl":"","font-500":""}," Hi, ",-1),T={"text-xl":""},U={key:0,"text-sm":"","my-4":""},q=n("span",{"op-50":""},"Also as known as:",-1),z=h(" Back ");function G(s,e,o,t,a,r){const i=w("router-link"),x=A,v=g;return _(),c("div",null,[H,R,n("div",T,l(t.name)+"! ",1),t.user.otherNames.length?(_(),c("p",U,[q,n("ul",null,[(_(!0),c(y,null,N(t.user.otherNames,u=>(_(),c("li",{key:u},[d(i,{to:`/hi/${u}`,replace:""},{default:m(()=>[h(l(u),1)]),_:2},1032,["to"])]))),128))])])):S("",!0),d(x),n("div",null,[d(v,{class:"btn m-3 text-sm",to:"/"},{default:m(()=>[z]),_:1})])])}var J=p(D,[["render",G]]);export{J as default};
