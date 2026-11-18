// GachaLog sponsored placements. Ads are clearly labeled and only active within their scheduled period.
(() => {
  const URL = "https://gwaqioappwunlmobsppb.supabase.co";
  const KEY = "sb_publishable_8KL4NTUVD-qu5WtvwJ8o4A_8S8iJB7C";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function loadSponsored() {
    const now = new Date().toISOString();
    const endpoint = new URL(URL + "/rest/v1/ad_campaigns");
    endpoint.searchParams.set("select","id,title,advertiser,description,image_url,target_url,placement");
    endpoint.searchParams.set("status","eq.active");
    endpoint.searchParams.set("start_at","lte."+now);
    endpoint.searchParams.set("end_at","gt."+now);
    endpoint.searchParams.set("order","id.desc");
    endpoint.searchParams.set("limit","20");
    try {
      const response = await fetch(endpoint,{headers:{apikey:KEY,Authorization:"Bearer "+KEY}});
      if (!response.ok) throw new Error(await response.text());
      const campaigns = await response.json();
      ["home","catalog"].forEach(place => {
        const slot = document.getElementById(place === "home" ? "homeSponsored" : "catalogSponsored");
        if (!slot) return;
        const visible = campaigns.filter(c => c.placement === place || c.placement === "both");
        slot.innerHTML = visible.map(c => `
          <a class="sponsored-card" href="${esc(c.target_url)}" target="_blank" rel="sponsored noopener noreferrer" data-sponsored-id="${Number(c.id)}">
            ${c.image_url ? '<img src="'+esc(c.image_url)+'" alt="">' : ''}
            <span class="sponsored-copy"><span class="sponsored-label">PR ・ ${esc(c.advertiser)}</span><strong>${esc(c.title)}</strong>${c.description ? '<p>'+esc(c.description)+'</p>' : ''}</span>
            <span class="sponsored-arrow" aria-hidden="true">↗</span>
          </a>`).join("");
        slot.querySelectorAll("[data-sponsored-id]").forEach(link => link.addEventListener("click", () => {
          const id = Number(link.dataset.sponsoredId);
          fetch(URL+"/rest/v1/rpc/increment_ad_campaign_click",{method:"POST",headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"},body:JSON.stringify({campaign_id:id})}).catch(()=>{});
        }));
      });
    } catch(error) { console.warn("Sponsored placements are unavailable:",error); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",loadSponsored);
  else loadSponsored();
})();
