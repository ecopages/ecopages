var L=Object.defineProperty;var M=(j,g)=>{for(var z in g)L(j,z,{get:g[z],enumerable:!0,configurable:!0,set:(B)=>g[z]=()=>B})};var N=function(j,g,z,B){var D=arguments.length,G=D<3?g:B===null?B=Object.getOwnPropertyDescriptor(g,z):B,J;if(typeof Reflect==="object"&&typeof Reflect.decorate==="function")G=Reflect.decorate(j,g,z,B);else for(var K=j.length-1;K>=0;K--)if(J=j[K])G=(D<3?J(G):D>3?J(g,z,G):J(g,z))||G;return D>3&&G&&Object.defineProperty(g,z,G),G};var Q=(j,g)=>()=>(j&&(g=j(j=0)),g);class E extends HTMLElement{static tagName="is-land";static prefix="is-land--";static attr={autoInitType:"autoinit",import:"import",template:"data-island",ready:"ready",defer:"defer-hydration"};static onceCache=new Map;static fallback={":not(:defined):not([defer-hydration])":(j,g,z)=>{let B=document.createElement(z+g.localName);for(let G of g.getAttributeNames())B.setAttribute(G,g.getAttribute(G));let D=g.shadowRoot;if(!D){let G=g.querySelector(":scope > template:is([shadowrootmode], [shadowroot])");if(G)D=g.attachShadow({mode:"open"}),D.appendChild(G.content.cloneNode(!0))}if(D)B.attachShadow({mode:D.mode}).append(...D.childNodes);return B.append(...g.childNodes),g.replaceWith(B),j.then(()=>{if(B.shadowRoot)g.shadowRoot.append(...B.shadowRoot.childNodes);g.append(...B.childNodes),B.replaceWith(g)})}};static autoinit={"petite-vue":function(j){j.createApp().mount(this)},vue:function(j){j.createApp().mount(this)},svelte:function(j){new j.default({target:this})},"svelte-ssr":function(j){new j.default({target:this,hydrate:!0})},preact:function(j){j.default(this)}};constructor(){super();this.ready=new Promise((j)=>{this.readyResolve=j})}static getParents(j,g=!1){let z=[];while(j){if(j.matches&&j.matches(E.tagName)){if(g&&j===g)break;if(H.hasConditions(j))z.push(j)}j=j.parentNode}return z}static async ready(j){let g=E.getParents(j);if(g.length===0)return;let z=await Promise.all(g.map((B)=>B.wait()));if(z.length)return z[0]}forceFallback(){if(window.Island)Object.assign(E.fallback,window.Island.fallback);for(let j in E.fallback){let g=Array.from(this.querySelectorAll(j)).reverse();for(let z of g){if(!z.isConnected||z.localName===E.tagName)continue;let B=E.ready(z);E.fallback[j](B,z,E.prefix)}}}wait(){return this.ready}async connectedCallback(){if(H.hasConditions(this))this.forceFallback();await this.hydrate()}getTemplates(){return this.querySelectorAll(`template[${E.attr.template}]`)}replaceTemplates(j){for(let g of j){if(E.getParents(g,this).length>0)continue;let z=g.getAttribute(E.attr.template);if(z==="replace"){let B=Array.from(this.childNodes);for(let D of B)this.removeChild(D);this.appendChild(g.content);break}else{let B=g.innerHTML;if(z==="once"&&B){if(E.onceCache.has(B)){g.remove();return}E.onceCache.set(B,!0)}g.replaceWith(g.content)}}}async hydrate(){let j=[];if(this.parentNode)j.push(E.ready(this.parentNode));let g=H.getConditions(this);for(let D in g)if(H.map[D])j.push(H.map[D](g[D],this));await Promise.all(j),this.replaceTemplates(this.getTemplates());let z,B=this.getAttribute(E.attr.import);if(B)z=await import(B);if(z){let D=E.autoinit[this.getAttribute(E.attr.autoInitType)||B];if(D)await D.call(this,z)}this.readyResolve(),this.setAttribute(E.attr.ready,""),this.querySelectorAll(`[${E.attr.defer}]`).forEach((D)=>D.removeAttribute(E.attr.defer))}}class H{static map={visible:H.visible,idle:H.idle,interaction:H.interaction,media:H.media,"save-data":H.saveData};static hasConditions(j){return Object.keys(H.getConditions(j)).length>0}static getConditions(j){let g={};for(let z of Object.keys(H.map))if(j.hasAttribute(`on:${z}`))g[z]=j.getAttribute(`on:${z}`);return g}static visible(j,g){if(!("IntersectionObserver"in window))return;return new Promise((z)=>{let B=new IntersectionObserver((D)=>{let[G]=D;if(G.isIntersecting)B.unobserve(G.target),z()});B.observe(g)})}static idle(){let j=new Promise((g)=>{if(document.readyState!=="complete")window.addEventListener("load",()=>g(),{once:!0});else g()});if(!("requestIdleCallback"in window))return j;return Promise.all([new Promise((g)=>{requestIdleCallback(()=>{g()})}),j])}static interaction(j,g){let z=["click","touchstart"];if(j)z=(j||"").split(",").map((B)=>B.trim());return new Promise((B)=>{function D(G){B();for(let J of z)g.removeEventListener(J,D)}for(let G of z)g.addEventListener(G,D,{once:!0})})}static media(j){let g={matches:!0};if(j&&"matchMedia"in window)g=window.matchMedia(j);if(g.matches)return;return new Promise((z)=>{g.addListener((B)=>{if(B.matches)z()})})}static saveData(j){if(!("connection"in navigator)||navigator.connection.saveData===(j!=="false"))return Promise.resolve();return new Promise(()=>{})}}if("customElements"in window)window.customElements.define(E.tagName,E),window.Island=E;var T=E.ready;