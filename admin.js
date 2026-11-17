const SUPABASE_URL = "https://gwaqioappwunlmobsppb.supabase.co";
const SUPABASE_KEY = "sb_publishable_8KL4NTUVD-qu5WtvwJ8o4A_8S8iJB7C";
const $ = (id) => document.getElementById(id);
let accessToken = sessionStorage.getItem("gachalog-admin-token") || "";

function showDashboard() {
  $("loginPanel").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
}
function showLogin() {
  $("dashboard").classList.add("hidden");
  $("loginPanel").classList.remove("hidden");
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
}
async function api(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}
function setMessage(text, isError = false) {
  $("message").textContent = text;
  $("message").style.color = isError ? "#9b352b" : "#287044";
}
async function loadPending() {
  $("pendingList").innerHTML = '<div class="panel muted">読み込み中...</div>';
  try {
    const rows = await api("/rest/v1/products?select=id,name,maker,price,category,release_date,release_month,description,image_url,source_url,source_checked_at,status,submitted_by,series_name&status=eq.pending&order=id.desc");
    if (!rows.length) {
      $("pendingList").innerHTML = '<div class="panel muted">確認待ちの商品はありません。</div>';
      return;
    }
    $("pendingList").innerHTML = rows.map(p => `
      <article class="item">
        <div class="item-main">
          <h3>${escapeHTML(p.name)}</h3>
          <div class="meta">
            メーカー：${escapeHTML(p.maker || "未設定")} ・ 価格：${escapeHTML(p.price ?? "未設定")}円<br>
            カテゴリ：${escapeHTML(p.category || "未設定")} ・ 発売：${escapeHTML(p.release_date || p.release_month || "未設定")}<br>シリーズ：${escapeHTML(p.series_name || "未設定")}<br>申請者ID：${escapeHTML(p.submitted_by || "自動登録")}<br>
            出典：${p.source_url && /^https?:\/\//i.test(p.source_url) ? `<a href="${escapeHTML(p.source_url)}" target="_blank" rel="noopener noreferrer">商品ページを開く</a>` : (p.submitted_by ? "ユーザーからの登録申請" : "未設定")}
          </div>
          <p class="desc">${escapeHTML(p.description || "説明なし")}</p>
          ${p.image_url ? `<img src="${escapeHTML(p.image_url)}" alt="" loading="lazy" style="max-width:120px;border-radius:10px">` : ""}
        </div>
        <div class="item-actions actions">
          <button class="primary" data-action="publish" data-id="${p.id}">公開する</button>
          <button class="danger" data-action="reject" data-id="${p.id}">却下する</button>
        </div>
      </article>`).join("");
    $("pendingList").querySelectorAll("button[data-id]").forEach(button => {
      button.addEventListener("click", () => updateStatus(button.dataset.id, button.dataset.action));
    });
  } catch (error) {
    $("pendingList").innerHTML = '<div class="panel">商品を読み込めませんでした。</div>';
    setMessage(`読み込みエラー：${error.message}\nRLS用SQLが未設定の場合も、このエラーになります。`, true);
  }
}
async function loadPendingVariants() {
  const target = $("pendingVariants");
  if (!target) return;
  target.innerHTML = '<div class="panel muted">読み込み中...</div>';
  try {
    const rows = await api("/rest/v1/product_variants?select=id,product_id,name,image_url,created_at,products(name)&status=eq.pending&order=id.desc");
    if (!rows.length) {
      target.innerHTML = '<div class="panel muted">確認待ちのカプセル種類はありません。</div>';
      return;
    }
    target.innerHTML = rows.map(v => `
      <article class="item">
        <div class="item-main">
          <h3>${escapeHTML(v.name)}</h3>
          <div class="meta">商品：${escapeHTML(v.products?.name || "商品名不明")} ・ 商品ID：${v.product_id}</div>
          ${v.image_url ? `<img src="${escapeHTML(v.image_url)}" alt="" loading="lazy" style="max-width:110px;border-radius:10px;margin-top:10px">` : ""}
        </div>
        <div class="item-actions actions">
          <button class="primary" data-variant-action="publish" data-id="${v.id}">公開する</button>
          <button class="danger" data-variant-action="reject" data-id="${v.id}">却下する</button>
        </div>
      </article>`).join("");
    target.querySelectorAll("[data-variant-action]").forEach(button => button.addEventListener("click", async () => {
      const status = button.dataset.variantAction === "publish" ? "published" : "rejected";
      if (!confirm(`「${button.closest(".item").querySelector("h3").textContent}」を${status === "published" ? "公開" : "却下"}しますか？`)) return;
      button.disabled = true;
      try {
        await api(`/rest/v1/product_variants?id=eq.${encodeURIComponent(button.dataset.id)}&status=eq.pending`, {
          method:"PATCH", headers:{Prefer:"return=minimal"}, body:JSON.stringify({status})
        });
        setMessage("カプセル種類を" + (status === "published" ? "公開" : "却下") + "しました。");
        await loadPendingVariants();
      } catch (error) { setMessage("更新エラー：" + error.message,true); button.disabled = false; }
    }));
  } catch (error) {
    target.innerHTML = '<div class="panel muted">種類を読み込めませんでした。</div>';
    setMessage("種類の読み込みエラー：" + error.message + "（先に種類管理用SQLを実行してください）",true);
  }
}
async function updateStatus(id, action) {
  const status = action === "publish" ? "published" : "rejected";
  const label = action === "publish" ? "公開" : "却下";
  if (!confirm(`この商品を「${label}」にしますか？`)) return;
  try {
    await api(`/rest/v1/products?id=eq.${encodeURIComponent(id)}&status=eq.pending`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status })
    });
    setMessage(`商品ID ${id} を${label}しました。`);
    await loadPending();
    await loadPendingVariants();
  } catch (error) {
    setMessage(`更新エラー：${error.message}`, true);
  }
}
$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("loginMessage").textContent = "ログイン中...";
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("email").value.trim(), password: $("password").value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "ログインに失敗しました");
    accessToken = data.access_token;
    sessionStorage.setItem("gachalog-admin-token", accessToken);
    $("loginMessage").textContent = "";
    showDashboard();
    await loadPending();
  } catch (error) {
    $("loginMessage").textContent = `ログインエラー：${error.message}`;
  }
});
$("logout").addEventListener("click", () => {
  accessToken = "";
  sessionStorage.removeItem("gachalog-admin-token");
  $("loginMessage").textContent = "ログアウトしました。";
  showLogin();
});
if (accessToken) {
  showDashboard();
  loadPending();
  loadPendingVariants();
}
