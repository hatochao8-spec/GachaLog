// GachaLog - Supabase connected version
const SUPABASE_URL = "https://gwaqioappwunlmobsppb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8KL4NTUVD-qu5WtvwJ8o4A_8S8iJB7C";

let products = [];
let owned = JSON.parse(localStorage.getItem("gacha-owned") || "[]");
let wishes = JSON.parse(localStorage.getItem("gacha-wishes") || "[]");
let activeFilter = "すべて";
const $ = s => document.querySelector(s);

const categoryStyles = {
  "動物": { emoji: "🐻", art: "#e8eee4" },
  "ミニチュア": { emoji: "☕", art: "#eee8df" },
  "雑貨": { emoji: "🏺", art: "#e9e6ef" },
  "キャラクター": { emoji: "🎀", art: "#f1e6eb" },
  "その他": { emoji: " capsule ", art: "#e8eee4" }
};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "価格未定";
  return /^\d+$/.test(String(value)) ? `${value}円` : String(value);
}
function normalizeProduct(row) {
  const category = row.category || "その他";
  const style = categoryStyles[category] || categoryStyles["その他"];
  return {
    id: Number(row.id),
    name: row.name || "名称未設定",
    maker: row.maker || "メーカー不明",
    price: formatPrice(row.price),
    category,
    emoji: style.emoji.trim(),
    art: style.art,
    desc: row.description || "商品詳細は準備中です。",
    image_url: row.image_url || "",
    release_date: row.release_date || "",
    release_month: row.release_month || ""
  };
}
async function loadProducts() {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/products`);
  endpoint.searchParams.set("select", "id,name,maker,price,category,release_date,release_month,description,image_url,status");
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("order", "id.desc");

  try {
    const response = await fetch(endpoint, {
      headers: {
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase API error (${response.status}): ${detail}`);
    }
    const rows = await response.json();
    products = rows.map(normalizeProduct);
    renderCatalog();
    renderCollection();
    if (products.length === 0) {
      $("#productGrid").innerHTML = '<p class="empty-message">商品データはまだありません。公開済みの商品をSupabaseに追加すると、ここに表示されます。</p>';
    }
  } catch (error) {
    console.error(error);
    $("#productGrid").innerHTML = '<p class="empty-message">商品データを読み込めませんでした。SupabaseのURL・キー・テーブル設定を確認してください。</p>';
    toast("商品データの読み込みに失敗しました");
  }
}

function save() {
  localStorage.setItem("gacha-owned", JSON.stringify(owned));
  localStorage.setItem("gacha-wishes", JSON.stringify(wishes));
  updateCounts();
}
function updateCounts() {
  $("#homeOwned").textContent = owned.length;
  $("#homeWishes").textContent = wishes.length;
  $("#collectionCount").textContent = owned.length;
}
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}
function productCard(p) {
  const visual = p.image_url
    ? `<img src="${escapeHTML(p.image_url)}" alt="${escapeHTML(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
    : `<span>${p.emoji}</span>`;
  return `<article class="product-card">
    <div class="product-art" style="--art:${p.art}">${visual}<small class="mini-label">${escapeHTML(p.category.toUpperCase())}</small></div>
    <div class="product-body"><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.maker)} ・ ${escapeHTML(p.price)}</p>
    <div class="product-actions">
      <button class="small-button ${owned.includes(p.id) ? "primary" : ""}" data-action="own" data-id="${p.id}">${owned.includes(p.id) ? "✓ 登録済み" : "+ コレクション"}</button>
      <button class="small-button" data-action="detail" data-id="${p.id}">詳細</button>
    </div></div></article>`;
}
function renderCatalog() {
  const q = $("#catalogSearch").value.toLowerCase();
  const filtered = products.filter(p =>
    (activeFilter === "すべて" || p.category === activeFilter) &&
    (p.name + p.maker).toLowerCase().includes(q)
  );
  $("#productGrid").innerHTML = filtered.map(productCard).join("");
  $("#resultCount").textContent = `${filtered.length} ITEMS`;
  $("#productGrid").querySelectorAll("button").forEach(bindProductButton);
}
function renderCollection() {
  const list = products.filter(p => owned.includes(p.id));
  $("#collectionGrid").innerHTML = list.map(productCard).join("");
  $("#collectionEmpty").hidden = list.length > 0;
  $("#collectionGrid").querySelectorAll("button").forEach(bindProductButton);
}
function bindProductButton(btn) {
  btn.addEventListener("click", () => {
    const p = products.find(x => x.id === Number(btn.dataset.id));
    if (!p) return;
    if (btn.dataset.action === "own") {
      owned = owned.includes(p.id) ? owned.filter(x => x !== p.id) : [...owned, p.id];
      save();
      renderCatalog();
      renderCollection();
      toast(owned.includes(p.id) ? "コレクションに登録しました" : "登録を解除しました");
    } else {
      showDetail(p);
    }
  });
}
function showDetail(p) {
  const detailVisual = p.image_url
    ? `<img src="${escapeHTML(p.image_url)}" alt="${escapeHTML(p.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
    : p.emoji;
  $("#dialogContent").innerHTML = `<div class="dialog-content">
    <div class="dialog-art" style="--art:${p.art}">${detailVisual}</div>
    <span class="tag">${escapeHTML(p.category)}</span><h2>${escapeHTML(p.name)}</h2>
    <p>${escapeHTML(p.desc)}</p><p>${escapeHTML(p.maker)}　/　${escapeHTML(p.price)}</p>
    ${p.release_date || p.release_month ? `<p>発売：${escapeHTML(p.release_date || p.release_month)}</p>` : ""}
    <div class="dialog-actions"><button class="primary" id="dialogOwn">${owned.includes(p.id) ? "登録を解除" : "コレクションに登録"}</button>
    <button id="dialogWish">${wishes.includes(p.id) ? "お気に入り解除" : "♡ 欲しいものリスト"}</button></div></div>`;
  $("#productDialog").showModal();
  $("#dialogOwn").onclick = () => {
    owned = owned.includes(p.id) ? owned.filter(x => x !== p.id) : [...owned, p.id];
    save(); renderCatalog(); renderCollection(); $("#productDialog").close();
    toast("コレクションを更新しました");
  };
  $("#dialogWish").onclick = () => {
    wishes = wishes.includes(p.id) ? wishes.filter(x => x !== p.id) : [...wishes, p.id];
    save(); $("#productDialog").close(); toast("欲しいものリストを更新しました");
  };
}
function go(tab) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(v => v.classList.toggle("active", v.dataset.tab === tab));
  $("#" + tab + "View").classList.add("active");
  if (tab === "catalog") renderCatalog();
  if (tab === "collection") renderCollection();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
document.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => {
  activeFilter = b.dataset.filter;
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("selected", c === b));
  renderCatalog();
}));
$("#catalogSearch").addEventListener("input", renderCatalog);
$("#homeSearch").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    go("catalog");
    $("#catalogSearch").value = e.target.value;
    renderCatalog();
  }
});
$("#profileButton").addEventListener("click", () => window.openGachaProfile?.());

updateCounts();
renderCatalog();
renderCollection();
loadProducts();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
