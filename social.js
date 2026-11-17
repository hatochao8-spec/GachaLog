// GachaLog Social: authentication, timeline, posts, likes, comments and profiles
(() => {
  const db = window.supabase && window.supabase.createClient(
    "https://gwaqioappwunlmobsppb.supabase.co",
    "sb_publishable_8KL4NTUVD-qu5WtvwJ8o4A_8S8iJB7C"
  );
  if (!db) { console.error("Supabase SDK is unavailable."); return; }
  const $ = (s) => document.querySelector(s);
  let user = null;
  let mode = "login";
  let loadingFeed = false;
  let feedFilter = "all";
  let collectionRows = [];

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function notify(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2200);
  }
  function dateLabel(v) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP", {month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  }
  function profileOf(row) {
    return Array.isArray(row) ? row[0] : row;
  }
  function avatar(profile) {
    const name = profile && (profile.display_name || profile.username) || "G";
    return '<div class="avatar">' + (profile && profile.avatar_url
      ? '<img src="' + esc(profile.avatar_url) + '" alt="">'
      : esc(name.slice(0,1))) + '</div>';
  }
  function showAuth(nextMode) {
    mode = nextMode || "login";
    $("#authTitle").textContent = mode === "signup" ? "アカウント新規作成" : "ログイン";
    $("#authSubmit").textContent = mode === "signup" ? "登録する" : "ログイン";
    $("#signupFields").hidden = mode !== "signup";
    $("#authPassword").autocomplete = mode === "signup" ? "new-password" : "current-password";
    $("#authMessage").textContent = "";
    $("#authDialog").showModal();
  }
  async function syncUser() {
    const result = await db.auth.getSession();
    user = result.data.session ? result.data.session.user : null;
    updateAuthUI();
  }
  function updateAuthUI() {
    $("#postAuthNotice").hidden = !!user;
    $("#createPostForm").hidden = !user;
    $("#profileAuthNotice").hidden = !!user;
    $("#profileButton").textContent = user ? "●" : "○";
    if ($("#productSubmitAuthNotice")) $("#productSubmitAuthNotice").hidden = !!user;
    if ($("#productSubmissionForm")) $("#productSubmissionForm").hidden = !user;
    if (user) { loadCollection().then(loadProfile); refreshNotificationBadge(); }
    else { collectionRows = []; window.gachaSetCollectionData?.([], []); }
  }

  async function authSubmit(event) {
    event.preventDefault();
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    const button = $("#authSubmit");
    button.disabled = true;
    $("#authMessage").textContent = "処理しています...";
    try {
      if (mode === "signup") {
        const username = $("#authUsername").value.trim().toLowerCase();
        const displayName = $("#authDisplayName").value.trim() || "ガチャ好き";
        if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new Error("ユーザーIDは半角英数字と _ で3〜20文字にしてください。");
        const result = await db.auth.signUp({
          email: email,
          password: password,
          options: {data: {username: username, display_name: displayName}}
        });
        if (result.error) throw result.error;
        if (result.data.session) {
          user = result.data.user;
          await syncUser();
          $("#authDialog").close();
          notify("アカウントを作成しました！");
        } else {
          $("#authMessage").textContent = "確認メールを送信しました。メール内のリンクを開いてからログインしてください。";
        }
      } else {
        const result = await db.auth.signInWithPassword({email: email, password: password});
        if (result.error) throw result.error;
        await syncUser();
        $("#authDialog").close();
        notify("ログインしました！");
        await loadFeed();
      }
    } catch (error) {
      $("#authMessage").textContent = error.message || "認証に失敗しました。";
    } finally {
      button.disabled = false;
    }
  }

  function updateFeedFilterUI() {
    document.querySelectorAll("[data-feed-filter]").forEach(button => {
      const selected = button.dataset.feedFilter === feedFilter;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  async function loadCollection() {
    if (!user) { collectionRows = []; window.gachaSetCollectionData?.([], []); return; }
    const result = await db.from("user_collections")
      .select("product_id,status,acquired_at,duplicate_count,products(id,name,maker,image_url,series_name)")
      .eq("user_id", user.id);
    if (result.error) { console.error("Collection load:", result.error); return notify("コレクションを読み込めませんでした：" + result.error.message); }
    collectionRows = result.data || [];
    window.gachaSetCollectionData?.(
      collectionRows.filter(row => row.status === "owned").map(row => row.product_id),
      collectionRows.filter(row => row.status === "wishlist").map(row => row.product_id)
    );
    renderCollectionRecords();
  }

  async function setCollectionStatus(productId, status) {
    if (!user) { showAuth("login"); return; }
    const current = collectionRows.find(row => Number(row.product_id) === Number(productId));
    const nextStatus = current && current.status === status ? null : status;
    const result = nextStatus
      ? await db.from("user_collections").upsert(
          {user_id:user.id, product_id:Number(productId), status:nextStatus},
          {onConflict:"user_id,product_id"}
        )
      : await db.from("user_collections").delete().eq("user_id",user.id).eq("product_id",Number(productId));
    if (result.error) return notify("登録を更新できませんでした：" + result.error.message);
    await loadCollection();
    notify(nextStatus === "owned" ? "持っている商品に登録しました！" :
      nextStatus === "wishlist" ? "ほしい物リストに追加しました！" : "リストから削除しました。");
  }

  window.gachaToggleCollection = (productId, kind) =>
    setCollectionStatus(productId, kind === "owned" ? "owned" : "wishlist");

  function renderCollectionProducts(rows) {
    return rows.map(row => {
      const p = profileOf(row.products);
      if (!p) return "";
      const visual = p.image_url
        ? '<img src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '" loading="lazy">'
        : '<span>🎁</span>';
      return '<article class="profile-collection-card"><div class="profile-collection-art">' + visual +
        '</div><div><strong>' + esc(p.name) + '</strong><small>' + esc(p.maker || "メーカー不明") + '</small></div></article>';
    }).join("") || '<p class="empty-message">まだ登録されていません。</p>';
  }

  function renderCollectionRecords() {
    const target = $("#collectionRecords");
    if (!target) return;
    const rows = collectionRows.filter(row => row.status === "owned");
    target.innerHTML = rows.map(row => {
      const product = profileOf(row.products);
      if (!product) return "";
      return '<article class="collection-record-card" data-record-product="' + Number(row.product_id) + '">' +
        '<strong>' + esc(product.name) + '</strong>' +
        '<label>獲得日<input type="date" data-record-date value="' + esc(row.acquired_at || "") + '"></label>' +
        '<label>ダブり数<input type="number" min="0" max="999" step="1" data-record-duplicates value="' + Number(row.duplicate_count || 0) + '"></label>' +
        '<small class="form-hint">ダブり数は、最初の1個を除いた追加分です</small>' +
        '<button type="button" class="small-button primary" data-save-record>記録を保存</button></article>';
    }).join("") || '<p class="empty-state">「持ってる」に登録した商品がここに表示されます。</p>';
  }

  async function saveCollectionRecord(card) {
    if (!user || !card) return;
    const productId = Number(card.dataset.recordProduct);
    const date = card.querySelector("[data-record-date]").value || null;
    const duplicates = Number(card.querySelector("[data-record-duplicates]").value);
    if (!Number.isInteger(duplicates) || duplicates < 0 || duplicates > 999) return notify("ダブり数は0〜999の整数で入力してください。");
    const result = await db.from("user_collections")
      .update({acquired_at:date, duplicate_count:duplicates})
      .eq("user_id",user.id).eq("product_id",productId).eq("status","owned");
    if (result.error) return notify("記録を保存できませんでした：" + result.error.message);
    await loadCollection();
    notify("獲得記録を保存しました！");
  }

  function renderSeriesProgress(ownedRows, catalogRows) {
    const ownedIds = new Set(ownedRows.map(row => Number(row.product_id)));
    const groups = {};
    (catalogRows || []).forEach(product => {
      const name = (product.series_name || "").trim();
      if (!name) return;
      if (!groups[name]) groups[name] = {total:0, owned:0};
      groups[name].total += 1;
      if (ownedIds.has(Number(product.id))) groups[name].owned += 1;
    });
    const entries = Object.entries(groups);
    if (!entries.length) return '<p class="empty-message">シリーズ名が登録された商品がまだありません。商品登録時に同じシリーズ名を設定すると達成率が表示されます。</p>';
    return entries.map(([name, value]) => {
      const percent = Math.round(value.owned / value.total * 100);
      const complete = value.owned === value.total;
      return '<div class="series-progress"><div class="series-progress-head"><strong>' + esc(name) +
        '</strong><span>' + value.owned + ' / ' + value.total + '種類 ・ ' + percent + '%</span></div>' +
        '<div class="series-progress-track"><span style="width:' + percent + '%"></span></div>' +
        (complete ? '<span class="series-complete">🏆 コンプリート！</span>' : '') + '</div>';
    }).join("");
  }

  async function loadFeed() {
    if (loadingFeed) return;
    loadingFeed = true;
    const feed = $("#timelineFeed");
    feed.innerHTML = '<p class="empty-message">投稿を読み込んでいます...</p>';
    updateFeedFilterUI();
    try {
      let query = db.from("posts")
        .select("id,user_id,content,image_path,product_id,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url),products(name,maker)")
        .eq("status", "published");
      if (feedFilter === "following") {
        if (!user) {
          feed.innerHTML = '<div class="empty-panel"><h2>ログインが必要です</h2><p class="muted">フォロー中の投稿を見るにはログインしてください。</p><button class="dark-button" data-feed-login>ログインする</button></div>';
          return;
        }
        const followed = await db.from("follows").select("following_id").eq("follower_id", user.id);
        if (followed.error) throw followed.error;
        const ids = (followed.data || []).map(row => row.following_id);
        if (!ids.length) {
          feed.innerHTML = '<div class="empty-panel"><h2>まだフォローしていません</h2><p class="muted">みんなの投稿から気になるユーザーをフォローしてみよう！</p></div>';
          return;
        }
        query = query.in("user_id", ids);
      }
      const result = await query.order("created_at", {ascending:false}).limit(50);
      if (result.error) throw result.error;
      const posts = result.data || [];
      if (!posts.length) {
        feed.innerHTML = '<div class="empty-panel"><h2>まだ投稿がありません</h2><p class="muted">最初のガチャ記録を投稿してみよう！</p><button class="dark-button" data-go="createPost">投稿する</button></div>';
        return;
      }
      const ids = posts.map(p => p.id);
      const responses = await Promise.all([
        db.from("post_likes").select("post_id,user_id").in("post_id", ids),
        db.from("comments").select("id,post_id,user_id,content,created_at,profiles(username,display_name)").in("post_id", ids).order("created_at")
      ]);
      if (responses[0].error) throw responses[0].error;
      if (responses[1].error) throw responses[1].error;
      const likes = responses[0].data || [];
      const comments = responses[1].data || [];
      feed.innerHTML = posts.map(post => {
        const p = profileOf(post.profiles);
        const product = profileOf(post.products);
        const postLikes = likes.filter(x => x.post_id === post.id);
        const postComments = comments.filter(x => x.post_id === post.id);
        const liked = user && postLikes.some(x => x.user_id === user.id);
        let commentHTML = postComments.map(c => {
          const cp = profileOf(c.profiles);
          return '<div class="comment-row"><strong>' + esc(cp && cp.display_name || "ガチャ好き") + '</strong>' + esc(c.content) + '</div>';
        }).join("");
        return '<article class="post-card" data-post-id="' + post.id + '">' +
          '<div class="post-head">' + avatar(p) + '<div class="post-author"><strong>' + esc(p && p.display_name || "ガチャ好き") + '</strong><small>@' + esc(p && p.username || "user") + '</small></div><time class="post-time">' + esc(dateLabel(post.created_at)) + '</time></div>' +
          (post.content ? '<p class="post-content">' + esc(post.content) + '</p>' : "") +
          (post.image_path ? '<img class="post-image" src="' + esc(post.image_path) + '" alt="ユーザー投稿画像" loading="lazy">' : "") +
          (product ? '<button type="button" class="post-product" data-action="product" data-product-id="' + post.product_id + '">🎁 関連商品：' + esc(product.name) + (product.maker ? ' ・ ' + esc(product.maker) : "") + '　›</button>' : "") +
          '<div class="post-actions"><button type="button" data-action="like" class="' + (liked ? "liked" : "") + '">♡ ' + postLikes.length + ' いいね</button><button type="button" data-action="comments">コメント ' + postComments.length + '件</button>' +
          (user && user.id !== post.user_id ? '<button type="button" data-action="profile" data-user-id="' + esc(post.user_id) + '">プロフィール</button>' : "") + '</div>' +
          '<div class="post-comments" ' + (postComments.length ? "" : "hidden") + '>' + commentHTML + '</div>' +
          (user ? '<form class="comment-form"><input name="comment" maxlength="500" placeholder="コメントを書く..." required><button type="submit">送信</button></form>' : "") +
          '</article>';
      }).join("");
    } catch (error) {
      console.error("Feed load:", error);
      feed.innerHTML = '<p class="empty-message">投稿を読み込めませんでした。<br>' + esc(error.message || "") + '</p>';
    } finally {
      loadingFeed = false;
    }
  }

  async function loadProductOptions() {
    const result = await db.from("products").select("id,name,maker").eq("status", "published").order("name").limit(500);
    if (result.error) { console.warn(result.error); return; }
    $("#postProduct").innerHTML = '<option value="">商品を選択しない</option>' +
      (result.data || []).map(p => '<option value="' + p.id + '">' + esc(p.name) + (p.maker ? '（' + esc(p.maker) + '）' : "") + '</option>').join("");
  }

  async function submitProduct(event) {
    event.preventDefault();
    if (!user) return showAuth("login");
    const name = $("#submissionName").value.trim();
    if (!name) return notify("商品名を入力してください。");
    const file = $("#submissionImage").files[0];
    if (file && !file.type.startsWith("image/")) return notify("画像ファイルを選んでください。");
    if (file && file.size > 5 * 1024 * 1024) return notify("画像は5MB以下にしてください。");
    const button = $("#productSubmissionForm").querySelector('button[type="submit"]');
    const message = $("#productSubmissionMessage");
    button.disabled = true;
    button.textContent = "申請しています...";
    message.textContent = "";
    try {
      const duplicate = await db.from("products").select("id,name").eq("status","published").ilike("name",name).limit(1);
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data && duplicate.data.length) throw new Error("同じ名前の商品が公開済みです。図鑑を確認してください。");
      let imageUrl = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g,"") || "jpg";
        const path = user.id + "/products/" + Date.now() + "." + ext;
        const upload = await db.storage.from("gachalog-posts").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
        if (upload.error) throw upload.error;
        imageUrl = db.storage.from("gachalog-posts").getPublicUrl(path).data.publicUrl;
      }
      const release = $("#submissionRelease").value.trim();
      const priceValue = $("#submissionPrice").value.trim();
      const payload = {
        name,
        maker: $("#submissionMaker").value.trim() || null,
        price: priceValue ? Number(priceValue) : null,
        category: $("#submissionCategory").value || "その他",
        release_month: release || null,
        series_name: $("#submissionSeries").value.trim() || null,
        description: $("#submissionDescription").value.trim() || null,
        image_url: imageUrl,
        image_source: imageUrl ? "user_upload" : null,
        source_url: "user-submission://" + crypto.randomUUID(),
        submitted_by: user.id,
        status: "pending"
      };
      const inserted = await db.from("products").insert(payload);
      if (inserted.error) throw inserted.error;
      $("#productSubmissionForm").reset();
      message.textContent = "申請を受け付けました。管理者の確認後に図鑑へ公開されます。";
      notify("商品を申請しました！");
    } catch (error) {
      console.error("Product submission:",error);
      message.textContent = "申請できませんでした：" + (error.message || "エラー");
      notify("商品申請に失敗しました。");
    } finally {
      button.disabled = false;
      button.textContent = "商品を申請する";
    }
  }

  async function createPost(event) {
    event.preventDefault();
    if (!user) return showAuth("login");
    const content = $("#postContent").value.trim();
    const file = $("#postImage").files[0];
    const productId = $("#postProduct").value;
    if (!content && !file) return notify("文章か写真を入力してください。");
    if (file && !file.type.startsWith("image/")) return notify("画像ファイルを選んでください。");
    if (file && file.size > 5 * 1024 * 1024) return notify("画像は5MB以下にしてください。");
    const button = $("#createPostForm").querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "投稿しています...";
    try {
      let imagePath = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = user.id + "/" + Date.now() + "." + ext;
        const upload = await db.storage.from("gachalog-posts").upload(path, file, {cacheControl:"3600",upsert:false,contentType:file.type});
        if (upload.error) throw upload.error;
        imagePath = db.storage.from("gachalog-posts").getPublicUrl(path).data.publicUrl;
      }
      const inserted = await db.from("posts").insert({
        user_id: user.id, content: content, image_path: imagePath,
        product_id: productId ? Number(productId) : null
      });
      if (inserted.error) throw inserted.error;
      $("#createPostForm").reset();
      notify("投稿しました！");
      await loadFeed();
      window.gachaGo("timeline");
    } catch (error) {
      console.error("Create post:", error);
      notify("投稿できませんでした：" + (error.message || "エラー"));
    } finally {
      button.disabled = false;
      button.textContent = "投稿する";
    }
  }

  async function feedClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest("[data-post-id]");
    if (!card) return;
    const postId = Number(card.dataset.postId);
    const action = button.dataset.action;
    if (action === "comments") {
      const area = card.querySelector(".post-comments");
      area.hidden = !area.hidden;
      return;
    }
    if (action === "profile") {
      if (user) await openPublicProfile(button.dataset.userId);
      else showAuth("login");
      return;
    }
    if (action === "product") {
      await openProductPosts(Number(button.dataset.productId));
      return;
    }
    if (!user) return showAuth("login");
    if (action === "like") {
      button.disabled = true;
      try {
        const found = await db.from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", user.id).maybeSingle();
        if (found.error) throw found.error;
        const result = found.data
          ? await db.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id)
          : await db.from("post_likes").insert({post_id:postId,user_id:user.id});
        if (result.error) throw result.error;
        await loadFeed();
      } catch (error) { notify("いいねを更新できませんでした：" + error.message); }
      finally { button.disabled = false; }
    }
  }

  async function commentSubmit(event) {
    if (!event.target.matches(".comment-form")) return;
    event.preventDefault();
    if (!user) return showAuth("login");
    const card = event.target.closest("[data-post-id]");
    const content = event.target.elements.comment.value.trim();
    if (!content) return;
    const result = await db.from("comments").insert({post_id:Number(card.dataset.postId),user_id:user.id,content:content});
    if (result.error) notify("コメントできませんでした：" + result.error.message);
    else { notify("コメントしました！"); await loadFeed(); }
  }

  async function loadProfile() {
    if (!user) return;
    const profileResult = await db.from("profiles").select("*").eq("id",user.id).maybeSingle();
    if (profileResult.error || !profileResult.data) return;
    const p = profileResult.data;
    const counts = await Promise.all([
      db.from("posts").select("*",{count:"exact",head:true}).eq("user_id",user.id).eq("status","published"),
      db.from("follows").select("*",{count:"exact",head:true}).eq("following_id",user.id),
      db.from("follows").select("*",{count:"exact",head:true}).eq("follower_id",user.id)
    ]);
    const [postsResult, itemsResult, catalogResult] = await Promise.all([
      db.from("posts").select("content,image_path,created_at").eq("user_id",user.id).eq("status","published").order("created_at",{ascending:false}).limit(20),
      db.from("user_collections").select("product_id,status,acquired_at,duplicate_count,products(id,name,maker,category,image_url,series_name)").eq("user_id",user.id),
      db.from("products").select("id,name,series_name").eq("status","published")
    ]);
    if (itemsResult.error) return notify("コレクションを表示できませんでした：" + itemsResult.error.message);
    const items = itemsResult.data || [];
    const ownedItems = items.filter(row => row.status === "owned");
    const wishItems = items.filter(row => row.status === "wishlist");
    $("#profilePanel").innerHTML =
      '<div class="profile-hero">' + avatar(p) + '<h2>' + esc(p.display_name) + '</h2><p class="auth-user-chip">@' + esc(p.username) + '</p><p class="profile-bio">' + esc(p.bio || "自己紹介はまだありません。") + '</p>' +
      '<div class="profile-stats"><div><strong>' + (counts[0].count || 0) + '</strong><span>投稿</span></div><div><strong>' + (counts[1].count || 0) + '</strong><span>フォロワー</span></div><div><strong>' + (counts[2].count || 0) + '</strong><span>フォロー</span></div></div>' +
      '<div class="profile-actions"><button id="editProfileButton">プロフィールを編集</button><button id="logoutButton">ログアウト</button></div></div>' +
      '<h3 class="profile-section-title">コレクション (' + ownedItems.length + ')</h3><div class="profile-collection-grid">' + renderCollectionProducts(ownedItems) + '</div>' +
      '<h3 class="profile-section-title">シリーズ達成率</h3><div class="series-progress-list">' + renderSeriesProgress(ownedItems, catalogResult.data || []) + '</div>' +
      '<h3 class="profile-section-title">ほしい物リスト (' + wishItems.length + ')</h3><div class="profile-collection-grid">' + renderCollectionProducts(wishItems) + '</div>' +
      '<form id="profileEditForm" class="profile-edit" hidden><label class="form-label" for="editAvatar">プロフィールアイコン</label><input id="editAvatar" type="file" accept="image/*"><p class="form-hint">画像は5MB以下にしてください。選択しなければ現在のアイコンを維持します。</p><label class="form-label" for="editDisplayName">表示名</label><input id="editDisplayName" maxlength="30" required value="' + esc(p.display_name) + '">' +
      '<label class="form-label" for="editBio">自己紹介</label><textarea id="editBio" maxlength="300" rows="3">' + esc(p.bio || "") + '</textarea><button class="dark-button" type="submit">保存する</button></form>' +
      '<h3 class="profile-section-title">自分の投稿</h3><div class="timeline-feed">' +
      ((postsResult.data || []).map(post => '<article class="post-card">' + (post.content ? '<p class="post-content">' + esc(post.content) + '</p>' : "") + (post.image_path ? '<img class="post-image" src="' + esc(post.image_path) + '" alt="">' : "") + '<small class="post-time">' + esc(dateLabel(post.created_at)) + '</small></article>').join("") || '<p class="empty-message">まだ投稿はありません。</p>') + '</div>';
    $("#profilePanel").hidden = false;
    $("#editProfileButton").addEventListener("click", () => $("#profileEditForm").hidden = !$("#profileEditForm").hidden);
    $("#logoutButton").addEventListener("click", async () => {
      const result = await db.auth.signOut();
      if (result.error) return notify(result.error.message);
      user = null;
      if (feedFilter === "following") feedFilter = "all";
      updateFeedFilterUI();
      updateAuthUI();
      notify("ログアウトしました。");
      window.gachaGo("timeline");
    });
    $("#profileEditForm").addEventListener("submit", async event => {
      event.preventDefault();
      const avatarFile = $("#editAvatar").files[0];
      if (avatarFile && (!avatarFile.type.startsWith("image/") || avatarFile.size > 5 * 1024 * 1024)) {
        return notify("アイコン画像は5MB以下の画像ファイルを選んでください。");
      }
      let avatarUrl = null;
      if (avatarFile) {
        const ext = (avatarFile.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = user.id + "/avatar-" + Date.now() + "." + ext;
        const upload = await db.storage.from("gachalog-posts").upload(path, avatarFile, {
          cacheControl:"3600", upsert:false, contentType:avatarFile.type
        });
        if (upload.error) return notify("画像をアップロードできませんでした：" + upload.error.message);
        avatarUrl = db.storage.from("gachalog-posts").getPublicUrl(path).data.publicUrl;
      }
      const updates = {
        display_name:$("#editDisplayName").value.trim(),
        bio:$("#editBio").value.trim()
      };
      if (avatarUrl) updates.avatar_url = avatarUrl;
      const result = await db.from("profiles").update(updates).eq("id",user.id);
      if (result.error) return notify("保存できませんでした：" + result.error.message);
      notify("プロフィールを更新しました！");
      await loadProfile();
    });
  }


  async function openProductPosts(productId) {
    if (!Number.isFinite(productId) || productId <= 0) return;
    const content = $("#socialDialogContent");
    content.innerHTML = '<div class="product-posts-panel"><p class="empty-message">商品情報と投稿を読み込んでいます...</p></div>';
    $("#socialDialog").showModal();
    try {
      const [productResult, postsResult] = await Promise.all([
        db.from("products").select("id,name,maker,category,image_url").eq("id", productId).eq("status", "published").maybeSingle(),
        db.from("posts").select("id,user_id,content,image_path,created_at,profiles!posts_user_id_fkey(username,display_name,avatar_url)").eq("product_id", productId).eq("status", "published").order("created_at", {ascending:false}).limit(50)
      ]);
      if (productResult.error) throw productResult.error;
      if (postsResult.error) throw postsResult.error;
      if (!productResult.data) throw new Error("商品が見つかりませんでした。");
      const product = productResult.data;
      const posts = postsResult.data || [];
      content.innerHTML = '<div class="product-posts-panel"><p class="eyebrow">PRODUCT COMMUNITY</p><h2>' + esc(product.name) + '</h2><p class="product-posts-maker">' + esc(product.maker || "メーカー不明") + '</p><p class="product-posts-count">' + posts.length + '件の投稿</p><div class="product-posts-list">' +
        (posts.map(post => {
          const profile = profileOf(post.profiles);
          return '<article class="post-card">' +
            '<div class="post-head">' + avatar(profile) + '<div class="post-author"><strong>' + esc(profile && profile.display_name || "ガチャ好き") + '</strong><small>@' + esc(profile && profile.username || "user") + '</small></div><time class="post-time">' + esc(dateLabel(post.created_at)) + '</time></div>' +
            (post.content ? '<p class="post-content">' + esc(post.content) + '</p>' : '') +
            (post.image_path ? '<img class="post-image" src="' + esc(post.image_path) + '" alt="ユーザー投稿画像" loading="lazy">' : '') +
            '</article>';
        }).join("") || '<p class="empty-message">この商品に関する投稿はまだありません。</p>') +
        '</div><button type="button" class="dark-button product-post-back" id="productPostsBack">閉じる</button></div>';
      $("#productPostsBack").addEventListener("click", () => $("#socialDialog").close());
    } catch (error) {
      console.error("Product posts:", error);
      content.innerHTML = '<div class="product-posts-panel"><h2>商品投稿を読み込めませんでした</h2><p class="empty-message">' + esc(error.message || "") + '</p></div>';
    }
  }

  function notificationText(item) {
    const actor = profileOf(item.profiles);
    const name = actor && (actor.display_name || actor.username) || "ユーザー";
    if (item.type === "like") return name + "さんがあなたの投稿にいいねしました。";
    if (item.type === "comment") return name + "さんがあなたの投稿にコメントしました。";
    if (item.type === "follow") return name + "さんがあなたをフォローしました。";
    return "新しい通知があります。";
  }

  async function refreshNotificationBadge() {
    const button = $("#notificationButton");
    if (!button) return;
    if (!user) { $("#notificationBadge").hidden = true; return; }
    const result = await db.from("notifications").select("id", {count:"exact",head:true})
      .eq("recipient_id", user.id).is("read_at", null);
    if (result.error) { console.warn("Notification badge:", result.error); return; }
    const count = result.count || 0;
    const badge = $("#notificationBadge");
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
  }

  async function openNotifications() {
    if (!user) { showAuth("login"); return; }
    const content = $("#socialDialogContent");
    content.innerHTML = '<div class="notifications-panel"><h2>通知</h2><p class="empty-message">読み込んでいます...</p></div>';
    $("#socialDialog").showModal();
    const result = await db.from("notifications")
      .select("id,type,actor_id,post_id,created_at,read_at,profiles!notifications_actor_id_fkey(username,display_name,avatar_url)")
      .eq("recipient_id", user.id).order("created_at", {ascending:false}).limit(50);
    if (result.error) {
      content.innerHTML = '<div class="notifications-panel"><h2>通知</h2><p class="empty-message">通知を読み込めませんでした。' + esc(result.error.message) + '</p></div>';
      return;
    }
    const items = result.data || [];
    if (!items.length) {
      content.innerHTML = '<div class="notifications-panel"><h2>通知</h2><p class="empty-message">まだ通知はありません。</p></div>';
      await refreshNotificationBadge();
      return;
    }
    content.innerHTML = '<div class="notifications-panel"><h2>通知</h2><div class="notification-list">' +
      items.map(item => '<button type="button" class="notification-item ' + (item.read_at ? "" : "unread") +
        '" data-notification-id="' + item.id + '" data-actor-id="' + esc(item.actor_id) +
        '" data-post-id="' + (item.post_id || "") + '">' + avatar(profileOf(item.profiles)) +
        '<span class="notification-copy"><strong>' + esc(notificationText(item)) +
        '</strong><small>' + esc(dateLabel(item.created_at)) + '</small></span>' +
        (item.read_at ? "" : '<span class="notification-dot"></span>') + '</button>').join("") +
      '</div></div>';
    await refreshNotificationBadge();
  }

  async function notificationClick(event) {
    const button = event.target.closest("[data-notification-id]");
    if (!button || !user) return;
    const id = Number(button.dataset.notificationId);
    const postId = button.dataset.postId;
    const actorId = button.dataset.actorId;
    const updated = await db.from("notifications").update({read_at:new Date().toISOString()})
      .eq("id", id).eq("recipient_id", user.id);
    if (updated.error) return notify("通知を更新できませんでした：" + updated.error.message);
    await refreshNotificationBadge();
    $("#socialDialog").close();
    if (postId) {
      window.gachaGo("timeline");
      await loadFeed();
      const card = document.querySelector('[data-post-id="' + CSS.escape(postId) + '"]');
      if (card) card.scrollIntoView({behavior:"smooth",block:"center"});
    } else if (actorId) {
      await openPublicProfile(actorId);
    }
  }

  async function searchUsers(event) {
    event.preventDefault();
    const input = $("#userSearchInput");
    const results = $("#userSearchResults");
    const term = input.value.trim().replace(/[,%()]/g, " ");
    if (!term) {
      results.innerHTML = '<p class="empty-message">ユーザーIDまたは表示名を入力してください。</p>';
      return;
    }
    results.innerHTML = '<p class="empty-message">検索しています...</p>';
    try {
      const [byUsername, byName] = await Promise.all([
        db.from("profiles").select("id,username,display_name,bio,avatar_url").ilike("username", "%" + term + "%").limit(20),
        db.from("profiles").select("id,username,display_name,bio,avatar_url").ilike("display_name", "%" + term + "%").limit(20)
      ]);
      if (byUsername.error) throw byUsername.error;
      if (byName.error) throw byName.error;
      const rows = [...(byUsername.data || []), ...(byName.data || [])];
      const unique = rows.filter((profile, index, all) => all.findIndex(item => item.id === profile.id) === index)
        .filter(profile => !user || profile.id !== user.id).slice(0, 20);
      if (!unique.length) {
        results.innerHTML = '<p class="empty-message">ユーザーが見つかりませんでした。</p>';
        return;
      }
      results.innerHTML = unique.map(profile =>
        '<button type="button" class="user-result" data-user-id="' + esc(profile.id) + '">' +
        avatar(profile) + '<span class="user-result-info"><strong>' + esc(profile.display_name || "ガチャ好き") +
        '</strong><small>@' + esc(profile.username || "user") + '</small>' +
        (profile.bio ? '<small class="user-result-bio">' + esc(profile.bio) + '</small>' : '') +
        '</span><span class="user-result-arrow">›</span></button>'
      ).join("");
    } catch (error) {
      console.error("User search:", error);
      results.innerHTML = '<p class="empty-message">検索できませんでした。' + esc(error.message || "") + '</p>';
    }
  }

  async function openPublicProfile(id) {
    if (!user) { showAuth("login"); return; }
    const result = await db.from("profiles").select("*").eq("id",id).maybeSingle();
    if (result.error || !result.data) return notify("プロフィールを取得できませんでした。");
    const p = result.data;
    const counts = await Promise.all([
      db.from("posts").select("*",{count:"exact",head:true}).eq("user_id",id).eq("status","published"),
      db.from("follows").select("*",{count:"exact",head:true}).eq("following_id",id),
      db.from("follows").select("*",{count:"exact",head:true}).eq("follower_id",id)
    ]);
    const [follow, posts, itemsResult, catalogResult] = await Promise.all([
      db.from("follows").select("follower_id").eq("follower_id",user.id).eq("following_id",id).maybeSingle(),
      db.from("posts").select("content,image_path,created_at").eq("user_id",id).eq("status","published").order("created_at",{ascending:false}).limit(20),
      db.from("user_collections").select("product_id,status,products(id,name,maker,category,image_url,series_name)").eq("user_id",id).eq("status","owned"),
      db.from("products").select("id,name,series_name").eq("status","published")
    ]);
    const ownedItems = itemsResult.data || [];
    const isFollowing = !!follow.data;
    $("#socialDialogContent").innerHTML = '<div class="profile-hero">' + avatar(p) + '<h2>' + esc(p.display_name) + '</h2><p class="auth-user-chip">@' + esc(p.username) + '</p><p class="profile-bio">' + esc(p.bio || "") + '</p>' +
      '<div class="profile-stats"><div><strong>' + (counts[0].count || 0) + '</strong><span>投稿</span></div><div><strong>' + (counts[1].count || 0) + '</strong><span>フォロワー</span></div><div><strong>' + (counts[2].count || 0) + '</strong><span>フォロー</span></div></div>' +
      (id !== user.id ? '<button class="follow-button ' + (isFollowing ? "following" : "") + '" id="publicFollowButton">' + (isFollowing ? "フォロー中（解除）" : "フォローする") + '</button>' : "") + '</div>' +
      '<h3 class="profile-section-title">コレクション (' + ownedItems.length + ')</h3><div class="profile-collection-grid">' + renderCollectionProducts(ownedItems) + '</div>' +
      '<h3 class="profile-section-title">シリーズ達成率</h3><div class="series-progress-list">' + renderSeriesProgress(ownedItems, catalogResult.data || []) + '</div>' +
      '<h3 class="profile-section-title">投稿</h3><div class="timeline-feed">' +
      ((posts.data || []).map(post => '<article class="post-card">' + (post.content ? '<p class="post-content">' + esc(post.content) + '</p>' : "") + (post.image_path ? '<img class="post-image" src="' + esc(post.image_path) + '" alt="">' : "") + '<small class="post-time">' + esc(dateLabel(post.created_at)) + '</small></article>').join("") || '<p class="empty-message">まだ投稿はありません。</p>') + '</div>';
    $("#socialDialog").showModal();
    const followButton = $("#publicFollowButton");
    if (followButton) followButton.addEventListener("click", async () => {
      const action = isFollowing
        ? await db.from("follows").delete().eq("follower_id",user.id).eq("following_id",id)
        : await db.from("follows").insert({follower_id:user.id,following_id:id});
      if (action.error) return notify(action.error.message);
      $("#socialDialog").close();
      notify(isFollowing ? "フォローを解除しました。" : "フォローしました！");
      await loadFeed();
    });
  }

  function bind() {
    $("#postLoginButton").addEventListener("click", () => showAuth("login"));
    $("#profileLoginButton").addEventListener("click", () => showAuth("login"));
    $("#profileButton").addEventListener("click", () => user ? window.gachaGo("profile") : showAuth("login"));
    $("#notificationButton").addEventListener("click", openNotifications);
    $("#socialDialogContent").addEventListener("click", notificationClick);
    $("#collectionRecords").addEventListener("click", event => {
      const button = event.target.closest("[data-save-record]");
      if (button) saveCollectionRecord(button.closest("[data-record-product]"));
    });
    $("#authSwitch").addEventListener("click", () => showAuth(mode === "login" ? "signup" : "login"));
    $("#authForm").addEventListener("submit", authSubmit);
    $("#createPostForm").addEventListener("submit", createPost);
    $("#productSubmitLoginButton").addEventListener("click", () => showAuth("login"));
    $("#productSubmissionForm").addEventListener("submit", submitProduct);
    $("#submissionImage").addEventListener("change", () => {
      const file = $("#submissionImage").files[0];
      if (file && file.size > 5 * 1024 * 1024) {
        $("#submissionImage").value = "";
        notify("画像は5MB以下にしてください。");
      }
    });
    $("#timelineFeed").addEventListener("click", feedClick);
    $("#userSearchForm").addEventListener("submit", searchUsers);
    $("#userSearchResults").addEventListener("click", event => {
      const result = event.target.closest("[data-user-id]");
      if (result) openPublicProfile(result.dataset.userId);
    });
    document.querySelectorAll("[data-feed-filter]").forEach(button => button.addEventListener("click", () => {
      feedFilter = button.dataset.feedFilter;
      loadFeed();
    }));
    $("#timelineFeed").addEventListener("click", event => {
      if (event.target.closest("[data-feed-login]")) showAuth("login");
    });
    $("#timelineFeed").addEventListener("submit", commentSubmit);
    $("#postImage").addEventListener("change", () => {
      const file = $("#postImage").files[0];
      if (file && file.size > 5 * 1024 * 1024) {
        $("#postImage").value = "";
        notify("画像は5MB以下にしてください。");
      }
    });
    $("#timelineFeed").addEventListener("click", event => {
      const button = event.target.closest("[data-go]");
      if (button) window.gachaGo(button.dataset.go);
    });
  }

  window.gachaShowProductPosts = openProductPosts;
  window.gachaLoadTimeline = loadFeed;
  window.gachaLoadProfile = loadProfile;
  window.openGachaProfile = () => user ? window.gachaGo("profile") : showAuth("login");
  document.addEventListener("DOMContentLoaded", async () => {
    bind();
    await syncUser();
    await loadProductOptions();
    await loadFeed();
  });
  db.auth.onAuthStateChange((_event, session) => {
    user = session ? session.user : null;
    updateAuthUI();
    if ($("#timelineFeed")) loadFeed();
  });
})();