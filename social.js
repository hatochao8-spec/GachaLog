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
    if (user) loadProfile();
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
          (product ? '<div class="post-product">🎁 関連商品：' + esc(product.name) + (product.maker ? ' ・ ' + esc(product.maker) : "") + '</div>' : "") +
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
    const postsResult = await db.from("posts").select("content,image_path,created_at").eq("user_id",user.id).eq("status","published").order("created_at",{ascending:false}).limit(20);
    $("#profilePanel").innerHTML =
      '<div class="profile-hero">' + avatar(p) + '<h2>' + esc(p.display_name) + '</h2><p class="auth-user-chip">@' + esc(p.username) + '</p><p class="profile-bio">' + esc(p.bio || "自己紹介はまだありません。") + '</p>' +
      '<div class="profile-stats"><div><strong>' + (counts[0].count || 0) + '</strong><span>投稿</span></div><div><strong>' + (counts[1].count || 0) + '</strong><span>フォロワー</span></div><div><strong>' + (counts[2].count || 0) + '</strong><span>フォロー</span></div></div>' +
      '<div class="profile-actions"><button id="editProfileButton">プロフィールを編集</button><button id="logoutButton">ログアウト</button></div></div>' +
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
    const follow = await db.from("follows").select("follower_id").eq("follower_id",user.id).eq("following_id",id).maybeSingle();
    const posts = await db.from("posts").select("content,image_path,created_at").eq("user_id",id).eq("status","published").order("created_at",{ascending:false}).limit(20);
    const isFollowing = !!follow.data;
    $("#socialDialogContent").innerHTML = '<div class="profile-hero">' + avatar(p) + '<h2>' + esc(p.display_name) + '</h2><p class="auth-user-chip">@' + esc(p.username) + '</p><p class="profile-bio">' + esc(p.bio || "") + '</p>' +
      '<div class="profile-stats"><div><strong>' + (counts[0].count || 0) + '</strong><span>投稿</span></div><div><strong>' + (counts[1].count || 0) + '</strong><span>フォロワー</span></div><div><strong>' + (counts[2].count || 0) + '</strong><span>フォロー</span></div></div>' +
      (id !== user.id ? '<button class="follow-button ' + (isFollowing ? "following" : "") + '" id="publicFollowButton">' + (isFollowing ? "フォロー中（解除）" : "フォローする") + '</button>' : "") + '</div>' +
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
    $("#authSwitch").addEventListener("click", () => showAuth(mode === "login" ? "signup" : "login"));
    $("#authForm").addEventListener("submit", authSubmit);
    $("#createPostForm").addEventListener("submit", createPost);
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