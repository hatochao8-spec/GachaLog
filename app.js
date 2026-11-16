const products = [
 {id:1,name:"まるい動物たち",maker:"Gacha Studio",price:"300円",category:"動物",emoji:"🐻",art:"#e8eee4",desc:"ころんとしたフォルムがかわいい動物たちのミニフィギュア。"},
 {id:2,name:"喫茶店のミニチュア",maker:"Miniature Works",price:"400円",category:"ミニチュア",emoji:"☕",art:"#eee8df",desc:"いつもの喫茶店を小さなサイズで再現したシリーズ。"},
 {id:3,name:"ちいさな花瓶コレクション",maker:"生活雑貨ラボ",price:"300円",category:"雑貨",emoji:"🏺",art:"#e9e6ef",desc:"デスクや棚に飾りたい小さな花瓶のコレクション。"},
 {id:4,name:"おやすみ猫",maker:"Gacha Studio",price:"300円",category:"動物",emoji:"🐈",art:"#e8eaf0",desc:"すやすや眠る猫たちのリラックスフィギュア。"},
 {id:5,name:"レトロ家電マスコット",maker:"Miniature Works",price:"500円",category:"ミニチュア",emoji:"📻",art:"#eee9df",desc:"懐かしい家電を手のひらサイズにしたシリーズ。"},
 {id:6,name:"小さなパン屋さん",maker:"生活雑貨ラボ",price:"400円",category:"雑貨",emoji:"🥐",art:"#f1e9dd",desc:"焼きたてパンをモチーフにしたミニチュア。"}
];
let owned = JSON.parse(localStorage.getItem("gacha-owned") || "[]");
let wishes = JSON.parse(localStorage.getItem("gacha-wishes") || "[]");
let activeFilter = "すべて";
const $ = s => document.querySelector(s);
function save(){localStorage.setItem("gacha-owned",JSON.stringify(owned));localStorage.setItem("gacha-wishes",JSON.stringify(wishes));updateCounts()}
function updateCounts(){$("#homeOwned").textContent=owned.length;$("#homeWishes").textContent=wishes.length;$("#collectionCount").textContent=owned.length}
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1800)}
function productCard(p){return `<article class="product-card"><div class="product-art" style="--art:${p.art}"><span>${p.emoji}</span><small class="mini-label">${p.category.toUpperCase()}</small></div><div class="product-body"><h3>${p.name}</h3><p>${p.maker} ・ ${p.price}</p><div class="product-actions"><button class="small-button ${owned.includes(p.id)?"primary":""}" data-action="own" data-id="${p.id}">${owned.includes(p.id)?"✓ 登録済み":"+ コレクション"}</button><button class="small-button" data-action="detail" data-id="${p.id}">詳細</button></div></div></article>`}
function renderCatalog(){const q=$("#catalogSearch").value.toLowerCase();const filtered=products.filter(p=>(activeFilter==="すべて"||p.category===activeFilter)&&(p.name+p.maker).toLowerCase().includes(q));$("#productGrid").innerHTML=filtered.map(productCard).join("");$("#resultCount").textContent=`${filtered.length} ITEMS`;$("#productGrid").querySelectorAll("button").forEach(bindProductButton)}
function renderCollection(){const list=products.filter(p=>owned.includes(p.id));$("#collectionGrid").innerHTML=list.map(productCard).join("");$("#collectionEmpty").hidden=list.length>0;$("#collectionGrid").querySelectorAll("button").forEach(bindProductButton)}
function bindProductButton(btn){btn.addEventListener("click",()=>{const p=products.find(x=>x.id===Number(btn.dataset.id));if(btn.dataset.action==="own"){owned=owned.includes(p.id)?owned.filter(x=>x!==p.id):[...owned,p.id];save();renderCatalog();renderCollection();toast(owned.includes(p.id)?"コレクションに登録しました":"登録を解除しました")}else showDetail(p)})}
function showDetail(p){$("#dialogContent").innerHTML=`<div class="dialog-content"><div class="dialog-art" style="--art:${p.art}">${p.emoji}</div><span class="tag">${p.category}</span><h2>${p.name}</h2><p>${p.desc}</p><p>${p.maker}　/　${p.price}</p><div class="dialog-actions"><button class="primary" id="dialogOwn">${owned.includes(p.id)?"登録を解除":"コレクションに登録"}</button><button id="dialogWish">${wishes.includes(p.id)?"お気に入り解除":"♡ 欲しいものリスト"}</button></div></div>`;$("#productDialog").showModal();$("#dialogOwn").onclick=()=>{owned=owned.includes(p.id)?owned.filter(x=>x!==p.id):[...owned,p.id];save();renderCatalog();renderCollection();$("#productDialog").close();toast("コレクションを更新しました")};$("#dialogWish").onclick=()=>{wishes=wishes.includes(p.id)?wishes.filter(x=>x!==p.id):[...wishes,p.id];save();$("#productDialog").close();toast("欲しいものリストを更新しました")}}
function go(tab){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));document.querySelectorAll(".tab").forEach(v=>v.classList.toggle("active",v.dataset.tab===tab));$("#"+tab+"View").classList.add("active");if(tab==="catalog")renderCatalog();if(tab==="collection")renderCollection();window.scrollTo(0,0)}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>go(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
document.querySelectorAll(".chip").forEach(b=>b.addEventListener("click",()=>{activeFilter=b.dataset.filter;document.querySelectorAll(".chip").forEach(c=>c.classList.toggle("selected",c===b));renderCatalog()}));
$("#catalogSearch").addEventListener("input",renderCatalog);
$("#homeSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){go("catalog");$("#catalogSearch").value=e.target.value;renderCatalog()}});
$("#profileButton").addEventListener("click",()=>toast("プロフィール機能は今後追加予定です"));
updateCounts();renderCatalog();renderCollection();
if("serviceWorker" in navigator && location.protocol!=="file:"){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
