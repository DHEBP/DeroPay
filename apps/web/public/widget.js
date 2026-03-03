"use strict";var DeroPay=(()=>{var H=`
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #f0fdf4;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.dp-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #10b981;
  color: #000;
  font-size: 15px;
  font-weight: 700;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition: background 0.15s;
}
.dp-btn:hover { background: #059669; }
.dp-btn svg { flex-shrink: 0; }

.dp-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: dp-fade-in 0.2s ease-out;
}

@keyframes dp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dp-modal {
  background: #0a0f0d;
  border: 1px solid #1e2a24;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  overflow: hidden;
  animation: dp-slide-up 0.2s ease-out;
}

@keyframes dp-slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.dp-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #1e2a24;
}

.dp-modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #f0fdf4;
}

.dp-close {
  background: none;
  border: none;
  color: #6b7f75;
  cursor: pointer;
  padding: 4px;
  font-size: 20px;
  line-height: 1;
}
.dp-close:hover { color: #f0fdf4; }

.dp-modal-body {
  padding: 24px 20px;
  text-align: center;
}

.dp-qr {
  background: #ffffff;
  padding: 10px;
  border-radius: 10px;
  display: inline-block;
  margin-bottom: 16px;
}
.dp-qr canvas { display: block; }

.dp-amount-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  margin-bottom: 4px;
}

.dp-amount-value {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #f0fdf4;
}

.dp-amount-label {
  font-size: 14px;
  font-weight: 700;
  color: #10b981;
}

.dp-fiat {
  font-size: 13px;
  color: #6b7f75;
  margin-bottom: 20px;
}

.dp-address-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #6b7f75;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  text-align: left;
}

.dp-address-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #000;
  border: 1px solid #1e2a24;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
}

.dp-address-box code {
  flex: 1;
  font-family: monospace;
  font-size: 10px;
  color: #f0fdf4;
  word-break: break-all;
  line-height: 1.4;
  text-align: left;
}

.dp-copy {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #6b7f75;
  cursor: pointer;
  padding: 4px;
}
.dp-copy:hover { color: #10b981; }

.dp-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(16,185,129,0.14);
  border-radius: 8px;
  margin-bottom: 8px;
}

.dp-status-text {
  font-size: 13px;
  font-weight: 600;
  color: #f0fdf4;
}

.dp-status.confirming { background: rgba(245,158,11,0.14); }
.dp-status.completed { background: rgba(16,185,129,0.2); }

.dp-countdown {
  font-size: 12px;
  color: #4a6356;
}

.dp-success {
  padding: 40px 20px;
  text-align: center;
}

.dp-success-icon {
  width: 56px;
  height: 56px;
  background: #10b981;
  color: #000;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 900;
  margin: 0 auto 12px;
  animation: dp-pop 0.3s ease-out;
}

@keyframes dp-pop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.dp-success h3 {
  font-size: 18px;
  font-weight: 700;
  color: #f0fdf4;
  margin-bottom: 4px;
}

.dp-success p {
  font-size: 13px;
  color: #6b7f75;
}

.dp-modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #1e2a24;
  text-align: center;
  font-size: 11px;
  color: #4a6356;
}

.dp-modal-footer a {
  color: #10b981;
  text-decoration: none;
}

.dp-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #1e2a24;
  border-top-color: #10b981;
  border-radius: 50%;
  animation: dp-spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes dp-spin {
  to { transform: rotate(360deg); }
}

.dp-loading {
  padding: 40px 20px;
  text-align: center;
}

.dp-loading p {
  font-size: 14px;
  color: #6b7f75;
}

.dp-error {
  padding: 32px 20px;
  text-align: center;
}

.dp-error p {
  font-size: 14px;
  color: #ef4444;
}
`;var W="deri1qy0ehnqcg0rr4qlsgkfgpv3cx6fmk9pq0a95rfhssmacxvhfvz2yqg2wpnee0gf5qmet0e8w4gp3sxm6t7ycx5qd6w5kfzlsq9ycx0z3qsadmn5k";function N(e,n){return{id:`inv_demo_${Math.random().toString(36).slice(2,10)}`,name:n||"Demo Payment",status:"pending",amount:String(e||25e5),amountReceived:"0",integratedAddress:W,expiresAt:new Date(Date.now()+900*1e3).toISOString(),createdAt:new Date().toISOString(),payments:[]}}async function z(e){let n={};e.fiatAmount&&e.currency?(n.fiatAmount=e.fiatAmount,n.currency=e.currency):e.amount&&(n.amount=e.amount),e.name&&(n.name=e.name),e.metadata&&(n.metadata=e.metadata),e.callbackUrl&&(n.callbackUrl=e.callbackUrl);let o=await fetch(`${e.gateway}/invoices`,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":e.apiKey},body:JSON.stringify(n)});if(!o.ok){let t=await o.json().catch(()=>({}));throw new Error(t.error||`HTTP ${o.status}`)}return o.json()}async function $(e,n){let o=await fetch(`${e}/status?invoiceId=${encodeURIComponent(n)}`);if(!o.ok){let t=await o.json().catch(()=>({}));throw new Error(t.error||`HTTP ${o.status}`)}return o.json()}function q(e,n,o=180){let t=Q(n),a=t.length,r=document.createElement("canvas");r.width=o,r.height=o;let i=r.getContext("2d"),s=o/a;i.fillStyle="#ffffff",i.fillRect(0,0,o,o),i.fillStyle="#000000";for(let d=0;d<a;d++)for(let l=0;l<a;l++)t[d][l]&&i.fillRect(l*s,d*s,s+.5,s+.5);e.innerHTML="",e.appendChild(r)}function Q(e){let n=new TextEncoder().encode(e),o=V(n.length),t=o*4+17,a=Array.from({length:t},()=>Array(t).fill(!1)),r=Array.from({length:t},()=>Array(t).fill(!1));Y(a,r,t),G(a,r,o,t),X(a,r,t),r[8][t-8]=!0,a[8][t-8]=!0;let i=Z(n,o);return te(a,r,i,t),ne(a,r,t),oe(a,t),a}function V(e){let n=[0,17,32,53,78,106,134,154,192,230,271,321,367,425,458,520,586,644,718,792,858];for(let o=1;o<=20;o++)if(e<=n[o])return o;return 20}function Y(e,n,o){for(let[t,a]of[[0,0],[0,o-7],[o-7,0]])for(let r=-1;r<=7;r++)for(let i=-1;i<=7;i++){let s=t+r,d=a+i;if(s<0||s>=o||d<0||d>=o)continue;n[s][d]=!0;let l=r===0||r===6||i===0||i===6,p=r>=2&&r<=4&&i>=2&&i<=4;e[s][d]=r>=0&&r<=6&&i>=0&&i<=6&&(l||p)}}function G(e,n,o,t){if(o<2)return;let a=J(o);for(let r of a)for(let i of a)if(!n[r][i])for(let s=-2;s<=2;s++)for(let d=-2;d<=2;d++)n[r+s][i+d]=!0,e[r+s][i+d]=Math.abs(s)===2||Math.abs(d)===2||s===0&&d===0}function J(e){if(e===1)return[];let n=e*4+10;if(e<=6)return[6,n];let o=Math.floor(e/7)+2,t=Math.ceil((n-6)/(o-1)/2)*2,a=[6];for(let r=n;a.length<o;r-=t)a.splice(1,0,r);return a}function X(e,n,o){for(let t=8;t<o-8;t++)n[6][t]||(n[6][t]=!0,e[6][t]=t%2===0),n[t][6]||(n[t][6]=!0,e[t][6]=t%2===0)}function Z(e,n){let o=ee(n),t=[];f(t,4,4),f(t,e.length,n<=9?8:16);for(let i of e)f(t,i,8);for(f(t,0,Math.min(4,o-t.length));t.length%8!==0;)t.push(0);let a=[236,17],r=0;for(;t.length<o;)f(t,a[r%2],8),r++;return t}function ee(e){let n=[0,152,272,440,640,864,1088,1248,1552,1856,2192,2592,2960,3424,3688,4184,4712,5176,5768,6360,6888];return n[e]??n[20]}function f(e,n,o){for(let t=o-1;t>=0;t--)e.push(n>>t&1)}function te(e,n,o,t){let a=0;for(let r=t-1;r>=1;r-=2){r===6&&(r=5);for(let i=0;i<t;i++)for(let s=0;s<2;s++){let d=r-s,l=(r+1&2)===0?t-1-i:i;n[l][d]||(e[l][d]=a<o.length?o[a]===1:!1,a++)}}}function ne(e,n,o){for(let t=0;t<o;t++)for(let a=0;a<o;a++)n[t][a]||(t+a)%2===0&&(e[t][a]=!e[t][a])}function oe(e,n){for(let t=0;t<15;t++){let a=(21522>>14-t&1)===1;t<6?e[8][t]=a:t===6?e[8][7]=a:t===7?e[8][8]=a:t===8?e[7][8]=a:e[14-t][8]=a,t<8?e[n-1-t][8]=a:e[8][n-15+t]=a}}var O=4e3,ae=1e5;function j(e){return(Number(e)/ae).toFixed(5)}function U(e,n,o,t,a){let r=document.createElement("div");r.className="dp-overlay";let i=document.createElement("div");i.className="dp-modal";let s=document.createElement("div");s.className="dp-modal-header",s.innerHTML=`
    <span class="dp-modal-title">${B(e.name||"Pay with DERO")}</span>
    <button class="dp-close" aria-label="Close">&times;</button>
  `;let d=document.createElement("div");d.className="dp-modal-body";let l=document.createElement("div");l.className="dp-qr",q(l,e.integratedAddress,180);let p=document.createElement("div");p.className="dp-amount-row",p.innerHTML=`
    <span class="dp-amount-value">${j(e.amount)}</span>
    <span class="dp-amount-label">DERO</span>
  `;let A=document.createElement("div");A.className="dp-fiat";let v=document.createElement("label");v.className="dp-address-label",v.textContent="Send to this address:";let g=document.createElement("div");g.className="dp-address-box",g.innerHTML=`
    <code>${B(e.integratedAddress)}</code>
    <button class="dp-copy" title="Copy address">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
    </button>
  `;let u=document.createElement("div");u.className="dp-status",u.innerHTML='<span>\u23F3</span><span class="dp-status-text">Waiting for payment...</span>';let b=document.createElement("div");b.className="dp-countdown",d.append(l,p,A,v,g,u,b);let w=document.createElement("div");w.className="dp-modal-footer",w.innerHTML='Powered by <a href="https://deropay.com" target="_blank" rel="noopener">DeroPay</a>',i.append(s,d,w),r.appendChild(i),o.appendChild(r),s.querySelector(".dp-close").addEventListener("click",S),r.addEventListener("click",c=>{c.target===r&&S()});let k=g.querySelector(".dp-copy");k.addEventListener("click",async()=>{await navigator.clipboard.writeText(e.integratedAddress),k.style.color="#10b981",setTimeout(()=>{k.style.color=""},2e3)});let y=null,E=null,T=null,M=null,x=!1;function P(){let c=new Date(e.expiresAt).getTime()-Date.now();if(c<=0){b.textContent="Expired";return}let C=Math.floor(c/6e4),L=Math.floor(c%6e4/1e3);b.textContent=`Expires in ${C}:${L.toString().padStart(2,"0")}`}function R(){d.innerHTML="";let c=document.createElement("div");c.className="dp-success",c.innerHTML=`
      <div class="dp-success-icon">\u2713</div>
      <h3>Payment Confirmed</h3>
      <p>${j(e.amount)} DERO received</p>
    `,d.appendChild(c),t?.(),o.host.dispatchEvent(new CustomEvent("deropay:completed",{bubbles:!0,detail:{invoiceId:e.id,amount:e.amount}}))}function m(c,C,L,I){u.className=I?`dp-status ${I}`:"dp-status",u.innerHTML=`<span>${C}</span><span class="dp-status-text">${L}</span>`}async function D(){if(!x){try{let c=await $(n,e.id);if(Object.assign(e,c),c.status==="confirming")m("confirming","\u26CF","Payment detected \u2014 confirming...","confirming");else if(c.status==="completed"){m("completed","\u2713","Payment confirmed!","completed"),h(),setTimeout(R,1200);return}else if(c.status==="expired"){m("expired","\u23F0","Invoice expired"),h();return}}catch{}y=window.setTimeout(D,O)}}function F(){T=window.setTimeout(()=>{x||(m("confirming","\u26CF","Payment detected \u2014 confirming...","confirming"),M=window.setTimeout(()=>{x||(m("completed","\u2713","Payment confirmed!","completed"),h(),setTimeout(R,1200))},3e3))},4e3)}function h(){y&&clearTimeout(y),E&&clearInterval(E),T&&clearTimeout(T),M&&clearTimeout(M)}function S(){x=!0,h(),r.remove()}return P(),E=window.setInterval(P,1e3),a?F():y=window.setTimeout(D,O),{destroy:S}}function B(e){let n=document.createElement("div");return n.textContent=e,n.innerHTML}function re(e){let n=e.dataset.demo==="true",o=e.dataset.gateway||(n?"https://demo.deropay.com":""),t=e.dataset.apiKey||(n?"demo":"");return!o||!t?null:{gateway:o.replace(/\/$/,""),apiKey:t,amount:e.dataset.amount?Number(e.dataset.amount):void 0,fiatAmount:e.dataset.fiatAmount?Number(e.dataset.fiatAmount):void 0,currency:e.dataset.currency,name:e.dataset.name,callbackUrl:e.dataset.callbackUrl,demo:n}}var K='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';function ie(e){let n=re(e);if(!n){console.warn("[DeroPay] Missing data-gateway or data-api-key on",e);return}let o=e.attachShadow({mode:"open"}),t=document.createElement("style");t.textContent=H,o.appendChild(t);let a=document.createElement("button");a.className="dp-btn",a.innerHTML=`${K} Pay with DERO`,o.appendChild(a);let r=!1;a.addEventListener("click",async()=>{if(!r){r=!0,a.textContent="Loading...";try{let i=n.demo?N(n.amount,n.name):await z({gateway:n.gateway,apiKey:n.apiKey,amount:n.amount,fiatAmount:n.fiatAmount,currency:n.currency,name:n.name,callbackUrl:n.callbackUrl});U(i,n.gateway,o,()=>{e.dispatchEvent(new CustomEvent("deropay:completed",{bubbles:!0,detail:{invoiceId:i.id,amount:i.amount}}))},n.demo)}catch(i){console.error("[DeroPay] Failed to create invoice:",i);let s=document.createElement("div");s.className="dp-overlay",s.innerHTML=`
        <div class="dp-modal">
          <div class="dp-modal-header">
            <span class="dp-modal-title">Error</span>
            <button class="dp-close">&times;</button>
          </div>
          <div class="dp-error">
            <p>${i instanceof Error?i.message:"Failed to create invoice"}</p>
          </div>
        </div>
      `,o.appendChild(s),s.querySelector(".dp-close")?.addEventListener("click",()=>s.remove()),s.addEventListener("click",d=>{d.target===s&&s.remove()})}finally{r=!1,a.innerHTML=`${K} Pay with DERO`}}})}function _(){document.querySelectorAll("[id='deropay-button'], .deropay-button, [data-deropay]").forEach(ie)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",_):_();})();
