const BASE_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";

// 🔐 PALITAN ANG ACCESS_TOKEN NG IYONG SARILING TOKEN
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3NGNiYzA3NTJlMGEzNmZkYWM2NjU3YmIyMDZmMGJlYyIsIm5iZiI6MTc4Mjk0Nzk2NS43MTEsInN1YiI6IjZhNDVhMDdkZWI1NWZjYzQ2YjQ5ZTM5MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ilS0nk-zuZzmHq75FG6rk-1y-bcua8J6aAUC-ddcnvc";

// 🌐 SEO: palitan kung ibang domain ang gagamitin mo (walang trailing slash)
const SITE_URL = "https://allf1ix.github.io";
const SITE_NAME = "AllFlix";

// GitHub Pages project-page subfolder (repo name = "AllFLix1", kaya hindi ito
// naka-host sa root "/" kundi sa "/AllFLix1/"). Ginagamit ito ng router para
// tama ang binubuong URL (buildDetailPath) at ang pagbabasa ulit ng URL
// (parseDetailPath), pati na rin sa mga history.replaceState/pushState calls.
// Kung ire-rename mo ang repo papuntang "allf1ix.github.io" (user page sa root),
// palitan mo na lang ito ng "/".
const BASE_PATH = "/";
const DEFAULT_DESCRIPTION = "Watch the latest official trailers for movies, TV shows, K-Dramas, and anime from around the world. Always updated, free, no account required.";

// Ilang items ang kukunin/ipapakita sa Trending row (swipeable, 4 kasabay na makikita)
const TRENDING_TOTAL = 12;

// Para sa Movies / TV Shows & Anime catalog: 50 pages x 20 items = 1000 items
// BUG FIX: dati 50 pages (1000 items) sabay-sabay na pino-fetch tuwing pipindutin
// ang Movies/TV tab, at hinihintay munang LAHAT bumalik bago may lumabas na kahit
// isang poster — kaya naramdamang mabagal/malag. 15 pages (300 items) ay sapat na
// sapat para sa pag-browse, at mas mabilis nang lumabas ang unang batch.
const CATALOG_PAGES = 15;
const MAX_CATALOG_ITEMS = 300;

let currentSelectedShow = { id: "", type: "", youtubeKey: "" };
let currentCategory = "trending";
let lastSearchQuery = "";
let homeScrollY = 0; // saved scroll position bago pumasok sa detail view, ibabalik pag pinindot ang Back

// Naka-save na wika mula sa localStorage (kung meron), default "en" kung wala pa
const LANG_STORAGE_KEY = "allflix_lang";
let currentLanguage = localStorage.getItem(LANG_STORAGE_KEY) || "en";

// Naka-save na dark/light mode mula sa localStorage (kung meron), default "dark" kung wala pa
const MODE_STORAGE_KEY = "allflix_mode";
let currentMode = localStorage.getItem(MODE_STORAGE_KEY) || "dark";

// TMDB language codes per site language
const tmdbLanguageMap = {
    en: "en-US", tl: "tl-PH", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN", es: "es-ES", fr: "fr-FR", id: "id-ID",
    ar: "ar-SA", hi: "hi-IN", pt: "pt-PT", de: "de-DE", it: "it-IT", ru: "ru-RU", vi: "vi-VN", th: "th-TH",
    tr: "tr-TR", nl: "nl-NL", pl: "pl-PL", sv: "sv-SE", no: "no-NO", da: "da-DK", fi: "fi-FI", el: "el-GR",
    he: "he-IL", uk: "uk-UA", cs: "cs-CZ", hu: "hu-HU", ro: "ro-RO", bn: "bn-BD", ur: "ur-PK", ms: "ms-MY",
    sw: "sw-KE", fa: "fa-IR", pa: "pa-IN", ta: "ta-IN", my: "my-MM", km: "km-KH"
};

function tmdbLang() {
    return tmdbLanguageMap[currentLanguage] || "en-US";
}

const rtlLanguages = ["ar", "he", "ur", "fa"];

// ===================== AUTO-TRANSLATE =====================
const TRANSLATE_CACHE_KEY = "allflix_translation_cache";
let translationCache = {};
try {
    translationCache = JSON.parse(localStorage.getItem(TRANSLATE_CACHE_KEY)) || {};
} catch (e) {
    translationCache = {};
}

function saveTranslationCache() {
    try {
        localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(translationCache));
    } catch (e) {
        translationCache = {};
    }
}

const translateQueue = [];
const TRANSLATE_CONCURRENCY = 8;
let translateActiveWorkers = 0;

function queueTranslate(text, sourceLang, targetLang, onDone) {
    translateQueue.push({ text, sourceLang, targetLang, onDone });
    fillTranslateWorkers();
}

function fillTranslateWorkers() {
    while (translateActiveWorkers < TRANSLATE_CONCURRENCY && translateQueue.length > 0) {
        const job = translateQueue.shift();
        translateActiveWorkers++;

        translateText(job.text, job.sourceLang, job.targetLang)
            .then(result => job.onDone(result))
            .catch(() => job.onDone(job.text))
            .finally(() => {
                translateActiveWorkers--;
                fillTranslateWorkers();
            });
    }
}

async function translateText(text, sourceLang, targetLang) {
    if (!text || !sourceLang || !targetLang || sourceLang === targetLang) return text;

    const cacheKey = `${sourceLang}|${targetLang}|${text}`;
    if (translationCache[cacheKey]) return translationCache[cacheKey];

    let result;
    if (text.length > 480) {
        const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
        const chunks = [];
        let current = "";
        sentences.forEach(sentence => {
            if ((current + sentence).length > 480) {
                if (current) chunks.push(current);
                current = sentence;
            } else {
                current += sentence;
            }
        });
        if (current) chunks.push(current);

        const translatedChunks = [];
        for (const chunk of chunks) {
            translatedChunks.push(await translateSingleChunk(chunk, sourceLang, targetLang));
        }
        result = translatedChunks.join(" ");
    } else {
        result = await translateSingleChunk(text, sourceLang, targetLang);
    }

    translationCache[cacheKey] = result;
    saveTranslationCache();
    return result;
}

async function translateSingleChunk(text, sourceLang, targetLang) {
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
        const res = await fetch(url);
        const data = await res.json();
        const translated = data && data.responseData && data.responseData.translatedText;
        if (translated && translated.trim() && !/^PLEASE SELECT/i.test(translated)) {
            return translated;
        }
    } catch (e) {
        console.error("Auto-translate error:", e);
    }
    return text;
}

function needsAutoTranslate(displayTitle, originalTitle, originalLanguage) {
    if (currentLanguage === "en") return false;
    if (!originalLanguage || originalLanguage === currentLanguage) return false;
    if (!displayTitle || !originalTitle) return false;
    return displayTitle.trim().toLowerCase() === originalTitle.trim().toLowerCase();
}
// ===================== ROUTING (per-movie/TV URLs) =====================
// URL pattern: /movie/{slug}-{tmdb-id}  o  /tv/{slug}-{tmdb-id}
// Kasama ang TMDB id sa dulo para garantisadong tama at mabilis ang lookup
// (walang backend/database ang static site na 'to), pero SEO-friendly at
// nababasa pa rin ang buong URL (hal. /movie/avatar-2009-19995).
function slugify(text) {
    return (text || "")
        .toString()
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "title";
}

function buildDetailPath(id, type, title, year) {
    const kind = type === "tv" ? "tv" : "movie";
    const base = slugify(title);
    const slug = year ? `${base}-${year}` : base;
    return `${BASE_PATH}${kind}/${slug}-${id}`;
}

function parseDetailPath(pathname) {
    let p = pathname;
    if (p.indexOf(BASE_PATH) === 0) {
        p = p.slice(BASE_PATH.length - 1); // panatilihin ang leading "/"
    }
    const match = p.match(/^\/(movie|tv)\/[a-z0-9-]*?-(\d+)\/?$/i);
    if (!match) return null;
    return { type: match[1].toLowerCase(), id: match[2] };
}

// ===================== SEO (title, meta description, OG, Twitter, canonical) =====================
// PAALALA: nagbabago ito sa runtime (client-side) — sapat ito para sa Google/Bing
// (nire-render nila ang JS bago i-index) at para sa browser tab title/copy-paste link.
// Hindi ito magagamit ng mga link-preview bot ng Messenger/Facebook/Twitter dahil hindi
// sila nagpapatakbo ng JavaScript — kukunin lang nila yung laman ng orihinal na index.html.
// Kung kailangan mo ring gumana ang per-movie na preview card sa Messenger/FB share,
// kakailanganin ng static pre-rendering (hal. GitHub Action na bumubuo ng static HTML
// per page) — sabihin mo lang kung gusto mong idagdag natin 'yon susunod.
function setMeta(attr, key, value) {
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute("content", value);
}

function setCanonical(url) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
    }
    link.setAttribute("href", url);
}

function updateSEO(data, type, path) {
    const canonicalUrl = SITE_URL + path;
    let title, description, image, ogType;

    if (data) {
        const name = data.title || data.name;
        const year = (data.release_date || data.first_air_date || "").slice(0, 4);
        title = `${name}${year ? " (" + year + ")" : ""} Trailer | ${SITE_NAME}`;
        description = (data.overview ? data.overview.slice(0, 155) : `Panoorin ang official trailer ng ${name} sa ${SITE_NAME}.`);
        image = data.backdrop_path ? (BACKDROP_URL + data.backdrop_path) : (data.poster_path ? (IMG_URL + data.poster_path) : (SITE_URL + BASE_PATH + "og-default.jpg"));
        ogType = "video.other";
    } else {
        title = `${SITE_NAME} — Official Movie, TV & Anime Trailers`;
        description = DEFAULT_DESCRIPTION;
        image = SITE_URL + BASE_PATH + "og-default.jpg";
        ogType = "website";
    }

    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:type", ogType);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", image);
    setCanonical(canonicalUrl);
}

// ===================== ON LOAD =====================
window.onload = function() {
    applyModeOnLoad();
    syncLanguageUI();
    applyLanguage();

    const initialPath = location.pathname;
    const detail = parseDetailPath(initialPath);

    loadTrending(() => {
        history.replaceState({}, "", BASE_PATH);
        if (detail) {
            history.pushState({ id: detail.id, type: detail.type }, "", initialPath);
            openDetail(detail.id, detail.type, { pushHistory: false });
        } else {
            updateSEO(null, null, BASE_PATH);
        }
    });

    window.addEventListener("popstate", function(event) {
        const state = event.state;
        if (state && state.id) {
            openDetail(state.id, state.type, { pushHistory: false });
        } else {
            renderHome();
        }
    });
};

function loadTrending(onDone) {
    renderHome();
    currentCategory = "trending";
    const url = `${BASE_URL}/trending/all/day?language=${tmdbLang()}`;
    document.getElementById("section-title").innerText = t("section_trending");

    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const trendingBtn = document.querySelector(".nav-btn");
    if (trendingBtn) trendingBtn.classList.add("active");

    document.getElementById("hero-banner").style.display = "flex";
    document.body.classList.remove("no-hero");

    fetchData(url, (data) => {
        if (data && data.results && data.results.length > 0) {
            renderTrendingCarousel(data.results);
            const firstItem = data.results[0];
            const type = firstItem.media_type || (firstItem.first_air_date ? "tv" : "movie");
            updateHeroSpotlight(firstItem.id, type, firstItem);
        }
        if (typeof onDone === "function") onDone();
    });
}

// Ibalik ang view sa homepage (trending grid / hero), hindi nire-reset ang scroll
// maliban kung sinabi (ginagamit ito pareho ng "Back" mula detail at ng popstate).
function renderHome() {
    stopDetailTrailer();
    document.getElementById("detailView").style.display = "none";
    document.querySelector(".media-container").style.display = "block";
    document.getElementById("hero-banner").style.display = currentCategory === "trending" ? "flex" : "none";
    document.body.classList.toggle("no-hero", currentCategory !== "trending");
    updateSEO(null, null, BASE_PATH);

    requestAnimationFrame(() => {
        window.scrollTo({ top: homeScrollY, behavior: "auto" });
    });
}

function fetchData(url, callback) {
    fetch(url, {
        method: "GET",
        headers: {
            accept: "application/json",
            Authorization: `Bearer ${ACCESS_TOKEN}`
        }
    })
    .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
    })
    .then(data => callback(data))
    .catch(err => {
        console.error("Error loading data from TMDB:", err);
        document.getElementById("banner-title").innerText = "Connection Error";
        document.getElementById("banner-desc").innerText = "Hindi makakonekta nang ligtas sa TMDB server. Pakisuri ang token.";
    });
}

// Pag-render ng mga Card sa Screen (grid, ginagamit ng Movies / TV / Search)
function renderGrid(items, limit = MAX_CATALOG_ITEMS, showNumbers = false) {
    const grid = document.getElementById("media-grid-items");
    grid.classList.remove("carousel-mode");

    const limitedItems = items.filter(item => item.poster_path).slice(0, limit);

    const htmlParts = limitedItems.map((item, index) => {
        const title = item.title || item.name;
        const originalTitle = item.original_title || item.original_name || title;
        const safeTitle = title ? title.replace(/"/g, "&quot;") : "";
        const safeOriginalTitle = originalTitle ? originalTitle.replace(/"/g, "&quot;") : "";
        const type = item.media_type || (item.first_air_date ? "tv" : "movie");
        const number = index + 1;
        const willTranslate = needsAutoTranslate(title, originalTitle, item.original_language);
        const year = (item.release_date || item.first_air_date || "").slice(0, 4);
        const href = buildDetailPath(item.id, type, title, year);

        // Totoong <a href> (hindi na plain <div onclick>) para makita at ma-crawl
        // ni Googlebot ang link papunta sa detail page. Ang onclick + preventDefault
        // ay siguradong SPA navigation pa rin ang mangyayari para sa totoong users
        // (walang full page reload), pero may crawlable na href na ngayon si Google.
        return `
            <a class="card" href="${href}" onclick="event.preventDefault(); openDetail('${item.id}', '${type}');" data-orig-title="${safeOriginalTitle}" data-orig-lang="${item.original_language || ""}">
                ${showNumbers ? `<span class="card-number">${number}</span>` : ""}
                <img src="${IMG_URL + item.poster_path}" alt="${safeTitle}" loading="lazy">
                <div class="card-details">
                    <div class="card-title${willTranslate ? " translating" : ""}">${title}</div>
                </div>
            </a>
        `;
    });

    grid.innerHTML = htmlParts.join("");
    observeCardsForTranslation();
}

// Trending Today: 12 items sa likod, pero 4 lang ang kita nang sabay — swipeable
// pahilis, may bahagyang "peek" ng susunod na card sa gilid para makita na may
// kadugtong pa (parang Netflix-style row) sa halip na malaking static grid.
function renderTrendingCarousel(items) {
    const grid = document.getElementById("media-grid-items");
    grid.classList.add("carousel-mode");

    const limitedItems = items.filter(item => item.poster_path).slice(0, TRENDING_TOTAL);

    const htmlParts = limitedItems.map((item, index) => {
        const title = item.title || item.name;
        const originalTitle = item.original_title || item.original_name || title;
        const safeTitle = title ? title.replace(/"/g, "&quot;") : "";
        const safeOriginalTitle = originalTitle ? originalTitle.replace(/"/g, "&quot;") : "";
        const type = item.media_type || (item.first_air_date ? "tv" : "movie");
        const number = index + 1;
        const willTranslate = needsAutoTranslate(title, originalTitle, item.original_language);
        const year = (item.release_date || item.first_air_date || "").slice(0, 4);
        const href = buildDetailPath(item.id, type, title, year);

        return `
            <a class="card" href="${href}" onclick="event.preventDefault(); openDetail('${item.id}', '${type}');" data-orig-title="${safeOriginalTitle}" data-orig-lang="${item.original_language || ""}">
                <span class="card-number">${number}</span>
                <img src="${IMG_URL + item.poster_path}" alt="${safeTitle}" loading="lazy">
                <div class="card-details">
                    <div class="card-title${willTranslate ? " translating" : ""}">${title}</div>
                </div>
            </a>
        `;
    });

    grid.innerHTML = htmlParts.join("");
    observeCardsForTranslation();
}

// Pag-click sa (‹ / ›) arrow ng isang carousel row (Trending o Top Cast),
// mag-i-scroll pahilis ng ~80% ng kita ng row, may smooth animation.
function scrollCarousel(containerId, direction) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
}

// I-translate lang ang mga title kapag NAKIKITA na sila sa screen (lazy) — para hindi mabusog
// agad ang daily quota ng libreng translation API kahit may hanggang 1000 items ang Movies/TV tab.
let cardTranslateObserver = null;
function observeCardsForTranslation() {
    if (cardTranslateObserver) cardTranslateObserver.disconnect();

    cardTranslateObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const card = entry.target;
            cardTranslateObserver.unobserve(card);

            const titleEl = card.querySelector(".card-title");
            if (!titleEl) return;

            const displayedTitle = titleEl.innerText;
            const originalTitle = card.dataset.origTitle;
            const originalLang = card.dataset.origLang;

            if (needsAutoTranslate(displayedTitle, originalTitle, originalLang)) {
                queueTranslate(originalTitle, originalLang, currentLanguage, (translated) => {
                    if (document.body.contains(titleEl)) {
                        titleEl.innerText = translated;
                        titleEl.classList.remove("translating");
                    }
                });
            } else {
                titleEl.classList.remove("translating");
            }
        });
    }, { rootMargin: "200px" });

    document.querySelectorAll(".card").forEach(card => cardTranslateObserver.observe(card));
}

// Paglipat ng Menu Tabs (Trending, Movies, TV/Anime)
function changeCategory(type) {
    const buttons = document.querySelectorAll(".nav-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");

    // Kung galing sa detail view, isara muna at ibalik sa homepage bago lumipat ng tab
    stopDetailTrailer();
    document.getElementById("detailView").style.display = "none";
    document.querySelector(".media-container").style.display = "block";
    history.replaceState({}, "", BASE_PATH);

    currentCategory = type;
    document.getElementById("section-title").innerText = t("section_trending");

    window.scrollTo({ top: 0, behavior: "smooth" });
    homeScrollY = 0;

    const heroBanner = document.getElementById("hero-banner");

    if (type === "movie") {
        document.getElementById("section-title").innerText = t("section_movies");
        heroBanner.style.display = "none";
        document.body.classList.add("no-hero");
        updateSEO(null, null, BASE_PATH);
        fetchManyPages(`${BASE_URL}/discover/movie?sort_by=popularity.desc&language=${tmdbLang()}`, CATALOG_PAGES,
            (firstPage) => renderGrid(firstPage, MAX_CATALOG_ITEMS, false),
            (allResults) => renderGrid(allResults, MAX_CATALOG_ITEMS, false)
        );
    } else if (type === "tv") {
        document.getElementById("section-title").innerText = t("section_tv");
        heroBanner.style.display = "none";
        document.body.classList.add("no-hero");
        updateSEO(null, null, BASE_PATH);
        fetchManyPages(`${BASE_URL}/discover/tv?sort_by=popularity.desc&language=${tmdbLang()}`, CATALOG_PAGES,
            (firstPage) => renderGrid(firstPage, MAX_CATALOG_ITEMS, false),
            (allResults) => renderGrid(allResults, MAX_CATALOG_ITEMS, false)
        );
    } else {
        heroBanner.style.display = "flex";
        document.body.classList.remove("no-hero");
        updateSEO(null, null, BASE_PATH);
        fetchData(`${BASE_URL}/trending/all/day?language=${tmdbLang()}`, (data) => {
            if (data && data.results) {
                renderTrendingCarousel(data.results);
                const firstItem = data.results[0];
                if (firstItem) {
                    const type2 = firstItem.media_type || (firstItem.first_air_date ? "tv" : "movie");
                    updateHeroSpotlight(firstItem.id, type2, firstItem);
                }
            }
        });
    }
}

// Kumuha ng ilang pages (para sa maraming resulta sa Movies / TV Shows & Anime).
// BUG FIX: dati, hinihintay munang matapos LAHAT ng pages (Promise.all) bago
// tumawag ng callback — kaya walang lumalabas na poster hangga't hindi nakakuha
// ang PINAKA-MABAGAL sa lahat ng 15+ requests. Ngayon, unang pinapakita agad ang
// page 1 (onFirstPage) para bilis lumabas ang unang batch, tapos dumadagdag na
// lang ang susunod na pages sa background (onMore) habang dumarating sila.
function fetchManyPages(baseUrl, totalPages, onFirstPage, onMore) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const fetchPage = (page) => fetch(`${baseUrl}${separator}page=${page}`, {
        method: "GET",
        headers: { accept: "application/json", Authorization: `Bearer ${ACCESS_TOKEN}` }
    }).then(res => res.ok ? res.json() : { results: [] }).catch(() => ({ results: [] }));

    fetchPage(1).then(firstData => {
        onFirstPage(firstData.results || []);

        if (totalPages <= 1) return;
        const remainingRequests = [];
        for (let page = 2; page <= totalPages; page++) {
            remainingRequests.push(fetchPage(page));
        }
        Promise.all(remainingRequests).then(pages => {
            const combined = pages.flatMap(p => p.results || []);
            if (typeof onMore === "function") onMore(combined);
        });
    });
}

// Search Functions
let searchDebounceTimer = null;

function handleSearch(event) {
    const query = document.getElementById("search-input").value.trim();

    if (event.key === "Enter") {
        closeSuggestions();
        triggerSearch();
        return;
    }

    clearTimeout(searchDebounceTimer);

    if (!query) {
        closeSuggestions();
        return;
    }

    searchDebounceTimer = setTimeout(() => {
        fetchSuggestions(query);
    }, 350);
}

function fetchSuggestions(query) {
    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=${tmdbLang()}`;
    fetchData(url, (data) => {
        const results = (data && data.results) ? data.results.filter(r => (r.title || r.name) && (r.media_type === "movie" || r.media_type === "tv")) : [];
        renderSuggestions(results.slice(0, 8));
    });
}

function renderSuggestions(results) {
    const list = document.getElementById("search-suggestions");
    list.innerHTML = "";

    if (results.length === 0) {
        list.innerHTML = `<li class="sugg-empty">${t("no_results")}</li>`;
        list.classList.add("open");
        return;
    }

    results.forEach(item => {
        const title = item.title || item.name;
        const type = item.media_type;
        const year = (item.release_date || item.first_air_date || "").slice(0, 4);
        const poster = item.poster_path ? (IMG_URL + item.poster_path) : "";
        const href = buildDetailPath(item.id, type, title, year);

        const li = document.createElement("li");
        li.innerHTML = `
            <a class="sugg-link" href="${href}">
                ${poster ? `<img src="${poster}" alt="${title}">` : `<div class="sugg-info" style="width:36px;height:52px;"></div>`}
                <div class="sugg-info">
                    <span class="sugg-title">${title}</span>
                    <span class="sugg-meta">${type === "tv" ? "TV Show" : "Movie"}${year ? " • " + year : ""}</span>
                </div>
            </a>
        `;
        const link = li.querySelector(".sugg-link");
        link.addEventListener("click", (e) => {
            e.preventDefault();
            selectSuggestion(item.id, type, title);
        });
        list.appendChild(li);
    });

    list.classList.add("open");
}

function selectSuggestion(id, type, title) {
    document.getElementById("search-input").value = title;
    closeSuggestions();
    const wrapper = document.getElementById("searchBoxWrapper");
    if (wrapper) wrapper.classList.remove("open");
    document.getElementById("search-input").value = "";
    openDetail(id, type);
}

function closeSuggestions() {
    const list = document.getElementById("search-suggestions");
    list.classList.remove("open");
    list.innerHTML = "";
}

function toggleSearchBox() {
    const wrapper = document.getElementById("searchBoxWrapper");
    const btn = document.getElementById("search-toggle-btn");
    const isOpen = wrapper.classList.toggle("open");

    if (isOpen) {
        const rect = btn.getBoundingClientRect();
        const wrapperWidth = wrapper.offsetWidth;
        const wrapperHeight = wrapper.offsetHeight;

        let left = rect.right + 10;
        if (left + wrapperWidth > window.innerWidth - 10) {
            left = rect.left - wrapperWidth - 10;
        }
        if (left < 10) left = 10;

        let top = rect.top + (rect.height / 2) - (wrapperHeight / 2);
        const maxTop = window.innerHeight - wrapperHeight - 10;
        if (top > maxTop) top = Math.max(10, maxTop);
        if (top < 10) top = 10;

        wrapper.style.top = top + "px";
        wrapper.style.left = left + "px";
        document.getElementById("search-input").focus();
    } else {
        document.getElementById("search-input").value = "";
        closeSuggestions();
    }
}

let lastKnownWindowWidth = window.innerWidth;
window.addEventListener("resize", () => {
    if (window.innerWidth === lastKnownWindowWidth) return;
    lastKnownWindowWidth = window.innerWidth;

    const wrapper = document.getElementById("searchBoxWrapper");
    if (wrapper && wrapper.classList.contains("open")) {
        wrapper.classList.remove("open");
    }
});

document.addEventListener("click", function(event) {
    const iconWrapper = document.querySelector(".search-icon-wrapper");
    if (iconWrapper && !iconWrapper.contains(event.target)) {
        closeSuggestions();
        const wrapper = document.getElementById("searchBoxWrapper");
        if (wrapper) wrapper.classList.remove("open");
    }
});

function triggerSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    closeSuggestions();
    const wrapper = document.getElementById("searchBoxWrapper");
    if (wrapper) wrapper.classList.remove("open");

    stopDetailTrailer();
    document.getElementById("detailView").style.display = "none";
    document.querySelector(".media-container").style.display = "block";
    document.getElementById("hero-banner").style.display = "none";
    document.body.classList.add("no-hero");
    history.replaceState({}, "", BASE_PATH);
    updateSEO(null, null, BASE_PATH);

    currentCategory = "search";
    lastSearchQuery = query;
    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=${tmdbLang()}`;
    document.getElementById("section-title").innerText = `${t("results_for")}: "${query}"`;

    fetchData(url, (data) => {
        if (data && data.results) {
            renderGrid(data.results, data.results.length, false);
        }
    });
}

// ===================== DETAIL PAGE (poster, cast carousel, trailer) =====================
function openDetail(id, type, opts = {}) {
    const { pushHistory = true } = opts;

    if (pushHistory) {
        homeScrollY = window.scrollY;
    }

    stopDetailTrailer();
    document.querySelector(".media-container").style.display = "none";
    document.getElementById("hero-banner").style.display = "none";
    document.getElementById("detailView").style.display = "block";
    window.scrollTo({ top: 0, behavior: "auto" });

    const detailsUrl = `${BASE_URL}/${type}/${id}?append_to_response=credits,videos&language=${tmdbLang()}`;
    fetchData(detailsUrl, (data) => {
        if (!data) return;
        renderDetailView(data, type);

        const title = data.title || data.name;
        const year = (data.release_date || data.first_air_date || "").slice(0, 4);
        const path = buildDetailPath(id, type, title, year);

        if (pushHistory) {
            history.pushState({ id: id.toString(), type }, "", path);
        }
        updateSEO(data, type, path);
    });
}

// "← Back": bumabalik gamit ang browser history (hindi bagong load), kaya
// palaging tama ang direksyon at nananatili sa dating scroll position ng Trending.
function closeDetail() {
    history.back();
}

function renderDetailView(data, type) {
    const title = data.title || data.name;
    const originalTitle = data.original_title || data.original_name || title;
    const originalLang = data.original_language;
    const runtimeMin = data.runtime || (data.episode_run_time && data.episode_run_time[0]) || 0;
    const hours = Math.floor(runtimeMin / 60);
    const mins = runtimeMin % 60;

    const posterEl = document.getElementById("detailPoster");
    posterEl.src = data.poster_path ? (IMG_URL + data.poster_path) : "";
    posterEl.alt = title;

    document.getElementById("detailType").innerText = type.toUpperCase();
    document.getElementById("detailTitle").innerText = title;
    document.getElementById("detailRating").innerText = `⭐ ${(data.vote_average || 0).toFixed(1)}`;
    document.getElementById("detailRuntime").innerText = runtimeMin ? `${hours}h ${mins}m` : "";
    document.getElementById("detailRelease").innerText = data.release_date || data.first_air_date || "";
    document.getElementById("detailOverview").innerText = data.overview || t("no_overview");

    if (needsAutoTranslate(title, originalTitle, originalLang)) {
        queueTranslate(originalTitle, originalLang, currentLanguage, (translated) => {
            document.getElementById("detailTitle").innerText = translated;
        });
    }

    if (!data.overview && currentLanguage !== "en") {
        fetchData(`${BASE_URL}/${type}/${data.id}?language=en-US`, (enData) => {
            if (enData && enData.overview) {
                queueTranslate(enData.overview, "en", currentLanguage, (translated) => {
                    document.getElementById("detailOverview").innerText = translated;
                });
            }
        });
    }

    const genresHtml = (data.genres || []).map(g => `<span class="detail-genre-pill">${g.name}</span>`).join("");
    document.getElementById("detailGenres").innerHTML = genresHtml;

    const director = data.credits && data.credits.crew ? data.credits.crew.find(c => c.job === "Director") : null;
    const directorEl = document.getElementById("detailDirector");
    if (director) {
        directorEl.innerHTML = `<strong>${t("director_label")}</strong> ${director.name}`;
        directorEl.style.display = "block";
    } else {
        directorEl.style.display = "none";
    }

    renderCastCarousel(data.credits ? data.credits.cast : []);

    currentSelectedShow.id = data.id.toString();
    currentSelectedShow.type = type;

    resolveTrailerKey(data, type, data.id, (key) => {
        currentSelectedShow.youtubeKey = key;
        renderDetailTrailer(key, title);
    });
}

// Cast list bilang swipeable row (hindi masikip na grid) — may "peek" ng
// susunod na cast card sa gilid para makita na may kadugtong pa.
function renderCastCarousel(cast) {
    const list = document.getElementById("detailCast");
    if (!cast || cast.length === 0) {
        list.innerHTML = `<p class="empty-note">${t("unknown_cast")}</p>`;
        return;
    }

    const items = cast.slice(0, 15).map(actor => {
        const photo = actor.profile_path ? (IMG_URL + actor.profile_path) : "";
        const safeName = (actor.name || "").replace(/"/g, "&quot;");
        return `
            <div class="cast-card">
                ${photo ? `<img src="${photo}" alt="${safeName}" loading="lazy">` : `<div class="cast-avatar-fallback">👤</div>`}
                <div class="cast-name">${actor.name || ""}</div>
                <div class="cast-role">${actor.character || ""}</div>
            </div>
        `;
    }).join("");

    list.innerHTML = items;
}

// Kunin ang pinaka-magandang trailer key mula sa isang TMDB videos response
function findTrailerKey(videosObj) {
    if (!videosObj || !videosObj.results) return "";
    const list = videosObj.results;
    const pick = list.find(v => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
                 list.find(v => v.site === "YouTube" && v.type === "Trailer") ||
                 list.find(v => v.site === "YouTube" && v.type === "Teaser") ||
                 list.find(v => v.site === "YouTube");
    return pick ? pick.key : "";
}

// BUG FIX: dati, kapag walang laman ang "videos" mula sa TMDB sa piniling wika
// (madalas mangyari — hindi lahat ng pelikula/palabas ay may dubbed/localized na
// trailer metadata), walang lumalabas na trailer kahit meron talaga sa English.
// Ngayon, kung walang mahanap sa kasalukuyang wika, awtomatiko itong bumabalik
// sa English (en-US) na resulta bilang fallback.
//
// BUG FIX 2: yung fallback sa itaas ay walang epekto pag ang currentLanguage
// mismo ay English — kasi parehong "en-US" ang unang query at ang fallback,
// kaya kapag ang totoong trailer ng title ay naka-tag lang sa TMDB bilang
// Japanese (karaniwan sa maraming anime), palaging walang trailer sa English
// users kahit meron naman talaga. Ngayon, isinasama na rin sa fallback ang
// orihinal na wika ng content (data.original_language, e.g. "ja" para sa
// karamihang anime) pati na rin ang mga video na walang language tag, para
// mahanap ito anuman ang piniling site language.
function resolveTrailerKey(data, type, id, callback) {
    const found = findTrailerKey(data.videos);
    if (found) return callback(found);

    const originalLang = data.original_language || "en";
    fetchData(`${BASE_URL}/${type}/${id}/videos?include_video_language=en,${originalLang},null`, (allVideos) => {
        callback(findTrailerKey(allVideos));
    });
}

// BUG FIX: dati, kapag walang video na mahanap sa TMDB (hindi laman ng
// database nila, madalas mangyari sa obscure/lumang titles), lumalabas na
// lang "No trailer available." Ngayon, may fallback tayo — gumagamit ng
// opisyal na YouTube "search as playlist" embed (walang kailangang API key)
// para awtomatikong i-play ang pinaka-unang resulta ng search sa YouTube
// gamit ang pamagat ng title, sa halip na walang laman.
function renderDetailTrailer(key, title) {
    const wrapper = document.getElementById("detailTrailerWrapper");
    if (key) {
        wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed/${key}" title="${t("trailer_label")}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    } else if (title) {
        const query = encodeURIComponent(`${title} official trailer`);
        wrapper.innerHTML = `<iframe src="https://www.youtube.com/embed?listType=search&list=${query}" title="${t("trailer_label")}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    } else {
        wrapper.innerHTML = `<p class="empty-note">${t("no_trailer")}</p>`;
    }
}

// BUG FIX: pag-alis ng trailer iframe (hindi lang pag-hide ng section) para
// tumigil talaga ang video/audio sa background pag umalis ang user sa detail
// page (Back, pagpalit ng tab, o bagong search). Basta't tinatago ang
// detailView, dapat tawagin ito.
function stopDetailTrailer() {
    const wrapper = document.getElementById("detailTrailerWrapper");
    if (wrapper) wrapper.innerHTML = "";
}

// ===================== HERO SPOTLIGHT (homepage banner + "Watch Now") =====================
// BUG FIX: dati, hinihintay muna ang BUONG detail fetch (kasama pa ang credits
// at videos) bago pa man lumabas ang backdrop ng hero banner — dalawang
// magkasunod na API call bago pa mapinta yung malaking picture. Ngayon, kung
// may laman na ang trending list item (previewItem — meron na itong
// backdrop_path at title), ipinipinta agad ang banner gamit iyon, habang
// tinatapos pa lang sa background ang detalyadong fetch (cast, overview,
// trailer).
function updateHeroSpotlight(id, type, previewItem) {
    if (previewItem) {
        const previewTitle = previewItem.title || previewItem.name;
        if (previewTitle) document.getElementById("banner-title").innerText = previewTitle;
        document.getElementById("banner-tag").innerText = type.toUpperCase();
        if (previewItem.backdrop_path) {
            document.getElementById("hero-banner").style.backgroundImage = `linear-gradient(to top, #0c0c0c 10%, rgba(12,12,12,0.4) 50%, rgba(12,12,12,0.8) 100%), url('${BACKDROP_URL + previewItem.backdrop_path}')`;
        }
    }

    const detailsUrl = `${BASE_URL}/${type}/${id}?append_to_response=credits,videos&language=${tmdbLang()}`;
    fetchData(detailsUrl, (data) => {
        if (!data) return;

        const title = data.title || data.name;
        const originalTitle = data.original_title || data.original_name || title;
        const originalLang = data.original_language;

        document.getElementById("banner-title").innerText = title;
        document.getElementById("banner-tag").innerText = type.toUpperCase();

        if (needsAutoTranslate(title, originalTitle, originalLang)) {
            queueTranslate(originalTitle, originalLang, currentLanguage, (translated) => {
                document.getElementById("banner-title").innerText = translated;
            });
        }

        applySpotlightOverview(data, type);

        if (data.backdrop_path) {
            document.getElementById("hero-banner").style.backgroundImage = `linear-gradient(to top, #0c0c0c 10%, rgba(12,12,12,0.4) 50%, rgba(12,12,12,0.8) 100%), url('${BACKDROP_URL + data.backdrop_path}')`;
        }

        if (data.credits && data.credits.cast && data.credits.cast.length > 0) {
            const actors = data.credits.cast.slice(0, 3).map(a => a.name).join(", ");
            document.getElementById("banner-cast").innerText = actors;
        } else {
            document.getElementById("banner-cast").innerText = t("unknown_cast");
        }

        currentSelectedShow.id = data.id.toString();
        currentSelectedShow.type = type;

        resolveTrailerKey(data, type, data.id, (key) => {
            currentSelectedShow.youtubeKey = key;
        });
    });
}

function applySpotlightOverview(data, type) {
    const descEl = document.getElementById("banner-desc");

    if (data.overview) {
        descEl.innerText = data.overview;
        return;
    }

    descEl.innerText = t("no_overview");
    if (currentLanguage === "en") return;

    fetchData(`${BASE_URL}/${type}/${data.id}?language=en-US`, (enData) => {
        if (enData && enData.overview) {
            queueTranslate(enData.overview, "en", currentLanguage, (translated) => {
                descEl.innerText = translated;
            });
        }
    });
}

// TRAILER PLAYER (Watch Now sa hero banner) — trailer lang, YouTube embed lang.
function openPlayer() {
    const modal = document.getElementById("videoModal");
    const container = document.getElementById("player-container");

    if (currentSelectedShow.youtubeKey) {
        container.innerHTML = `<iframe src="https://www.youtube.com/embed/${currentSelectedShow.youtubeKey}?autoplay=1" title="${t("trailer_label")}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        modal.style.display = "block";
        return;
    }

    // Kung wala pang na-resolve na trailer key (hal. kakabukas lang ng banner), subukan
    // munang hanapin ito (kasama ang English fallback) bago magpakita ng "walang stream".
    const id = currentSelectedShow.id;
    const type = currentSelectedShow.type;
    if (!id || !type) {
        container.innerHTML = `<div class="empty-note" style="padding:50px; text-align:center;">${t("no_stream")}</div>`;
        modal.style.display = "block";
        return;
    }

    fetchData(`${BASE_URL}/${type}/${id}/videos?language=${tmdbLang()}`, (videos) => {
        resolveTrailerKey({ videos }, type, id, (key) => {
            currentSelectedShow.youtubeKey = key;
            if (key) {
                container.innerHTML = `<iframe src="https://www.youtube.com/embed/${key}?autoplay=1" title="${t("trailer_label")}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
            } else {
                container.innerHTML = `<div class="empty-note" style="padding:50px; text-align:center;">${t("no_stream")}</div>`;
            }
            modal.style.display = "block";
        });
    });
}

function closePlayer() {
    const modal = document.getElementById("videoModal");
    const container = document.getElementById("player-container");
    container.innerHTML = "";
    modal.style.display = "none";
}

window.onclick = function(event) {
    const modal = document.getElementById("videoModal");
    if (event.target == modal) closePlayer();
};

// ===================== SIDE SETTINGS PANEL =====================
function toggleSidePanel() {
    document.getElementById("sidePanel").classList.toggle("open");
    document.getElementById("sideOverlay").classList.toggle("open");
}

function closeSidePanel() {
    document.getElementById("sidePanel").classList.remove("open");
    document.getElementById("sideOverlay").classList.remove("open");
}

// HOME: babalik sa Trending mula sa umpisa (fresh reset), hiwalay ito sa "← Back"
// na siyang nagbabalik sa eksaktong dating scroll position.
function goHome() {
    closeSidePanel();
    homeScrollY = 0;
    loadTrending();
    history.replaceState({}, "", BASE_PATH);
    updateSEO(null, null, BASE_PATH);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function t(key) {
    const dict = translations[currentLanguage] || translations.en;
    return dict[key] || translations.en[key] || key;
}

function toggleLanguagePanel() {
    closeSidePanel();
    document.getElementById("langOverlay").classList.add("open");
    document.getElementById("langPanel").classList.add("open");
}

function closeLanguagePanel() {
    document.getElementById("langOverlay").classList.remove("open");
    document.getElementById("langPanel").classList.remove("open");
}

// Pagpili ng wika - buo nang gumagana, binabago ang mga labels ng buong site
function selectLanguage(langCode) {
    currentLanguage = langCode;

    // I-save ang napiling wika para manatili ito kahit mag-refresh o bumalik sa site
    localStorage.setItem(LANG_STORAGE_KEY, langCode);

    syncLanguageUI();
    applyLanguage();
    refreshContent();

    setTimeout(() => {
        closeLanguagePanel();
    }, 300);
}

// I-tugma ang UI (dir/lang attribute, naka-highlight na wika sa listahan) sa kasalukuyang currentLanguage.
// Ginagamit ito pareho sa unang pag-load (mula sa naka-save na wika) at tuwing may bagong pinili.
function syncLanguageUI() {
    document.querySelectorAll("#lang-list li").forEach(li => {
        li.classList.toggle("selected", li.dataset.lang === currentLanguage);
    });
    document.documentElement.dir = rtlLanguages.includes(currentLanguage) ? "rtl" : "ltr";
    document.documentElement.lang = currentLanguage;
}

// Muling kunin ang kasalukuyang nilalaman (trending/movie/tv/search) gamit ang bagong napiling wika,
// para ma-localize din ang mga pamagat at detalye ng movie/TV mula sa TMDB.
function refreshContent() {
    const lang = tmdbLang();

    if (currentCategory === "movie") {
        fetchManyPages(`${BASE_URL}/discover/movie?sort_by=popularity.desc&language=${lang}`, CATALOG_PAGES,
            (firstPage) => renderGrid(firstPage, MAX_CATALOG_ITEMS, false),
            (allResults) => renderGrid(allResults, MAX_CATALOG_ITEMS, false)
        );
    } else if (currentCategory === "tv") {
        fetchManyPages(`${BASE_URL}/discover/tv?sort_by=popularity.desc&language=${lang}`, CATALOG_PAGES,
            (firstPage) => renderGrid(firstPage, MAX_CATALOG_ITEMS, false),
            (allResults) => renderGrid(allResults, MAX_CATALOG_ITEMS, false)
        );
    } else if (currentCategory === "search" && lastSearchQuery) {
        const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(lastSearchQuery)}&language=${lang}`;
        fetchData(url, (data) => {
            if (data && data.results) renderGrid(data.results, data.results.length, false);
        });
    } else {
        fetchData(`${BASE_URL}/trending/all/day?language=${lang}`, (data) => {
            if (data && data.results) {
                renderTrendingCarousel(data.results);
                const firstItem = data.results[0];
                if (firstItem) {
                    const type = firstItem.media_type || (firstItem.first_air_date ? "tv" : "movie");
                    updateHeroSpotlight(firstItem.id, type, firstItem);
                }
            }
        });
    }

    // Kung nakabukas ang isang detail page, i-refresh din ito sa bagong wika
    // nang hindi nagdaragdag ng bagong history entry (kaya't ang "Back" ay hindi
    // sumasablay kahit magpalit ng wika habang nasa detail view).
    const detailOpen = document.getElementById("detailView").style.display !== "none";
    if (detailOpen && currentSelectedShow.id && currentSelectedShow.type) {
        openDetail(currentSelectedShow.id, currentSelectedShow.type, { pushHistory: false });
    }
}

// Paghahanap/pag-filter sa listahan ng mga wika sa loob ng Language panel
function filterLanguages(event) {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll("#lang-list li").forEach(li => {
        const matches = li.textContent.toLowerCase().includes(query);
        li.classList.toggle("lang-hidden", !matches);
    });
}

// I-apply ang napiling wika sa lahat ng static na text sa site
function applyLanguage() {
    document.getElementById("nav-trending").innerText = t("nav_trending");
    document.getElementById("nav-movies").innerText = t("nav_movies");
    document.getElementById("nav-tv").innerText = t("nav_tv");
    document.getElementById("search-input").placeholder = t("search_placeholder");

    // Brand name (nagpapalit sa mga wikang di-Latin na script; nananatiling ALLFLIX sa mga wikang Latin ang alpabeto)
    const brand = t("brand");
    document.getElementById("navbar-brand").innerText = brand;
    document.getElementById("side-brand").innerText = brand;
    const footerBrandFlix = document.getElementById("footer-brand-flix");
    if (brand === "ALLFLIX") {
        document.getElementById("footer-brand").childNodes[0].nodeValue = "ALL";
        footerBrandFlix.innerText = "FLIX";
    } else {
        document.getElementById("footer-brand").childNodes[0].nodeValue = "";
        footerBrandFlix.innerText = brand;
    }

    document.getElementById("footer-link-about").innerText = t("footer_about");
    document.getElementById("footer-link-benefits").innerText = t("footer_benefits");
    document.getElementById("footer-link-support").innerText = t("footer_support");
    document.getElementById("footer-copy").innerText = t("footer_copy");

    document.getElementById("label-home").innerText = t("home");
    document.getElementById("label-language").innerText = t("language");
    document.getElementById("label-mode").innerText = t("mode");
    document.getElementById("label-download").innerText = t("download");
    document.getElementById("label-aboutus").innerText = t("about_us");

    document.getElementById("label-select-language").innerText = t("select_language");
    document.getElementById("lang-note").innerText = t("lang_note");

    document.getElementById("label-cast").innerText = t("cast");
    document.getElementById("label-watchnow").innerText = t("watch_now");

    // Detail page labels
    document.getElementById("label-detail-back").innerText = t("back");
    document.getElementById("label-detail-cast").innerText = t("top_cast");
    document.getElementById("label-detail-trailer").innerText = t("trailer_label");

    buildDownloadCards();

    // I-update ang section title base sa kasalukuyang tab
    const sectionTitle = document.getElementById("section-title");
    if (currentCategory === "movie") sectionTitle.innerText = t("section_movies");
    else if (currentCategory === "tv") sectionTitle.innerText = t("section_tv");
    else if (currentCategory === "trending") sectionTitle.innerText = t("section_trending");
}

// ===================== LANGUAGE PANEL =====================
const translations = {
    "en": {
        "nav_trending": "Trending",
        "nav_movies": "Movies",
        "nav_tv": "TV Shows & Anime",
        "search_placeholder": "Search for Movies, Anime, or Drama...",
        "home": "Home",
        "language": "Language",
        "mode": "Mode",
        "download": "Download",
        "about_us": "About Us",
        "select_language": "Select Language",
        "lang_note": "Note: Titles and descriptions are automatically translated when available. Some titles may stay in their original language if a translation isn't provided by the source.",
        "cast": "Cast:",
        "watch_now": "▶ Watch Now",
        "back": "← Back",
        "top_cast": "Top Cast",
        "trailer_label": "Trailer",
        "no_trailer": "No trailer available yet for this title.",
        "director_label": "Director:",
        "download_appname": "AllFLix Android",
        "download_badge": "Coming Soon",
        "download_text": "Watch full movies, TV episodes, anime, and dramas on the official AllFlix app.",
        "notify_me": "Notify Me",
        "notify_me_done": "You'll be notified!",
        "section_trending": "Trending Today",
        "section_movies": "Popular Movies",
        "section_tv": "Popular TV Shows & Anime",
        "brand": "ALLFLIX",
        "footer_about": "About",
        "footer_benefits": "Benefits",
        "footer_support": "Support",
        "footer_copy": "© 2026 AllFlix. All rights reserved.",
        "no_results": "No results found.",
        "results_for": "Results for",
        "no_overview": "No overview available for this title.",
        "unknown_cast": "Unknown Cast",
        "no_stream": "No streaming link or trailer available for this title yet."
    },
    "tl": {
        "nav_trending": "Trending",
        "nav_movies": "Mga Pelikula",
        "nav_tv": "TV Shows & Anime",
        "search_placeholder": "Maghanap ng Pelikula, Anime, o Drama...",
        "home": "Home",
        "language": "Wika",
        "mode": "Mode",
        "download": "I-download",
        "about_us": "Tungkol Sa Amin",
        "select_language": "Pumili ng Wika",
        "lang_note": "Paalala: Awtomatikong isinasalin ang pamagat at buod kung available. Maaaring manatili sa orihinal na wika ang ilang pamagat kung walang salin.",
        "cast": "Mga Aktor:",
        "watch_now": "▶ Panoorin Na",
        "download_appname": "AllFLix Android",
        "download_badge": "Malapit Na",
        "download_text": "Panoorin ang buong pelikula, TV episodes, anime, at drama sa opisyal na AllFlix app.",
        "notify_me": "Ipaalam sa Akin",
        "notify_me_done": "Ipapaalam sa iyo!",
        "section_trending": "Trending Ngayon",
        "section_movies": "Sikat na mga Pelikula",
        "section_tv": "Sikat na TV Shows & Anime",
        "brand": "ALLFLIX",
        "footer_about": "Tungkol",
        "footer_benefits": "Benepisyo",
        "footer_support": "Suporta",
        "footer_copy": "© 2026 AllFlix. Nakalaan ang lahat ng karapatan.",
        "no_results": "Walang nahanap na resulta.",
        "results_for": "Resulta para sa",
        "no_overview": "Walang nakikitang buod para sa palabas na ito.",
        "unknown_cast": "Hindi Kilalang Kast",
        "no_stream": "Wala pang streaming link o trailer para rito."
    },
    "ja": {
        "nav_trending": "トレンド",
        "nav_movies": "映画",
        "nav_tv": "テレビ番組とアニメ",
        "search_placeholder": "映画、アニメ、ドラマを検索...",
        "home": "ホーム",
        "language": "言語",
        "mode": "モード",
        "download": "ダウンロード",
        "about_us": "私たちについて",
        "select_language": "言語を選択",
        "lang_note": "注：可能な場合、タイトルと説明は自動的に翻訳されます。翻訳がない場合は元の言語のまま表示されることがあります。",
        "cast": "出演者：",
        "watch_now": "▶ 今すぐ見る",
        "download_appname": "AllFLixアンドロイド",
        "download_badge": "近日公開",
        "download_text": "公式AllFlixアプリで映画、テレビ番組、アニメ、ドラマをフルでお楽しみいただけます。",
        "notify_me": "通知を受け取る",
        "notify_me_done": "通知が設定されました！",
        "section_trending": "今日のトレンド",
        "section_movies": "人気の映画",
        "section_tv": "人気のテレビ番組とアニメ",
        "brand": "オールフリックス",
        "footer_about": "概要",
        "footer_benefits": "特典",
        "footer_support": "サポート",
        "footer_copy": "© 2026 AllFlix. 無断複写・転載を禁じます。",
        "no_results": "結果が見つかりません。",
        "results_for": "検索結果",
        "no_overview": "この作品の概要はありません。",
        "unknown_cast": "出演者不明",
        "no_stream": "この作品にはまだ配信リンクや予告編がありません。"
    },
    "ko": {
        "nav_trending": "트렌딩",
        "nav_movies": "영화",
        "nav_tv": "TV 프로그램 & 애니메이션",
        "search_placeholder": "영화, 애니메이션, 드라마 검색...",
        "home": "홈",
        "language": "언어",
        "mode": "모드",
        "download": "다운로드",
        "about_us": "회사 소개",
        "select_language": "언어 선택",
        "lang_note": "참고: 가능한 경우 제목과 설명이 자동으로 번역됩니다. 번역이 없으면 원래 언어로 표시될 수 있습니다.",
        "cast": "출연진:",
        "watch_now": "▶ 지금 시청하기",
        "download_appname": "AllFLix 안드로이드",
        "download_badge": "출시 예정",
        "download_text": "공식 AllFlix 앱에서 영화, TV 에피소드, 애니메이션, 드라마를 전편 시청하세요.",
        "notify_me": "알림 받기",
        "notify_me_done": "알림이 설정되었습니다!",
        "section_trending": "오늘의 트렌드",
        "section_movies": "인기 영화",
        "section_tv": "인기 TV 프로그램 & 애니메이션",
        "brand": "올플릭스",
        "footer_about": "소개",
        "footer_benefits": "혜택",
        "footer_support": "고객지원",
        "footer_copy": "© 2026 AllFlix. 모든 권리 보유.",
        "no_results": "검색 결과가 없습니다.",
        "results_for": "검색 결과",
        "no_overview": "이 작품에 대한 줄거리가 없습니다.",
        "unknown_cast": "출연진 정보 없음",
        "no_stream": "이 작품에는 아직 스트리밍 링크나 예고편이 없습니다."
    },
    "zh": {
        "nav_trending": "热门",
        "nav_movies": "电影",
        "nav_tv": "电视剧和动漫",
        "search_placeholder": "搜索电影、动漫或电视剧...",
        "home": "首页",
        "language": "语言",
        "mode": "模式",
        "download": "下载",
        "about_us": "关于我们",
        "select_language": "选择语言",
        "lang_note": "注意：如有可用译文，标题和简介将自动翻译。若无译文，部分标题可能保留原始语言。",
        "cast": "演员：",
        "watch_now": "▶ 立即观看",
        "download_appname": "AllFLix 安卓",
        "download_badge": "即将推出",
        "download_text": "在官方 AllFlix 应用上观看完整的电影、电视剧、动漫和电视剧。",
        "notify_me": "通知我",
        "notify_me_done": "我们会通知您！",
        "section_trending": "今日热门",
        "section_movies": "热门电影",
        "section_tv": "热门电视剧和动漫",
        "brand": "奥弗利克斯",
        "footer_about": "关于",
        "footer_benefits": "权益",
        "footer_support": "支持",
        "footer_copy": "© 2026 AllFlix. 保留所有权利。",
        "no_results": "未找到结果。",
        "results_for": "搜索结果",
        "no_overview": "该作品暂无简介。",
        "unknown_cast": "演员信息暂缺",
        "no_stream": "此作品暂无播放链接或预告片。"
    },
    "es": {
        "nav_trending": "Tendencias",
        "nav_movies": "Películas",
        "nav_tv": "Series y Anime",
        "search_placeholder": "Buscar películas, anime o series...",
        "home": "Inicio",
        "language": "Idioma",
        "mode": "Modo",
        "download": "Descargar",
        "about_us": "Sobre Nosotros",
        "select_language": "Seleccionar Idioma",
        "lang_note": "Nota: Los títulos y descripciones se traducen automáticamente cuando están disponibles. Algunos títulos pueden mantenerse en su idioma original si no hay traducción.",
        "cast": "Reparto:",
        "watch_now": "▶ Ver Ahora",
        "download_appname": "AllFLix Android",
        "download_badge": "Próximamente",
        "download_text": "Mira películas, episodios de series, anime y dramas completos en la app oficial de AllFlix.",
        "notify_me": "Avísame",
        "notify_me_done": "¡Te avisaremos!",
        "section_trending": "Tendencias de Hoy",
        "section_movies": "Películas Populares",
        "section_tv": "Series y Anime Populares",
        "brand": "ALLFLIX",
        "footer_about": "Acerca de",
        "footer_benefits": "Beneficios",
        "footer_support": "Soporte",
        "footer_copy": "© 2026 AllFlix. Todos los derechos reservados.",
        "no_results": "No se encontraron resultados.",
        "results_for": "Resultados para",
        "no_overview": "No hay sinopsis disponible para este título.",
        "unknown_cast": "Reparto Desconocido",
        "no_stream": "Aún no hay enlace de transmisión ni tráiler para este título."
    },
    "fr": {
        "nav_trending": "Tendances",
        "nav_movies": "Films",
        "nav_tv": "Séries et Anime",
        "search_placeholder": "Rechercher films, anime ou séries...",
        "home": "Accueil",
        "language": "Langue",
        "mode": "Mode",
        "download": "Télécharger",
        "about_us": "À Propos",
        "select_language": "Choisir la Langue",
        "lang_note": "Remarque : Les titres et descriptions sont traduits automatiquement lorsqu'ils sont disponibles. Certains titres peuvent rester dans leur langue d'origine.",
        "cast": "Distribution :",
        "watch_now": "▶ Regarder",
        "download_appname": "AllFLix Android",
        "download_badge": "Bientôt Disponible",
        "download_text": "Regardez des films, épisodes, anime et dramas complets sur l'application officielle AllFlix.",
        "notify_me": "Me Notifier",
        "notify_me_done": "Vous serez notifié !",
        "section_trending": "Tendances du Jour",
        "section_movies": "Films Populaires",
        "section_tv": "Séries et Anime Populaires",
        "brand": "ALLFLIX",
        "footer_about": "À Propos",
        "footer_benefits": "Avantages",
        "footer_support": "Assistance",
        "footer_copy": "© 2026 AllFlix. Tous droits réservés.",
        "no_results": "Aucun résultat trouvé.",
        "results_for": "Résultats pour",
        "no_overview": "Aucun résumé disponible pour ce titre.",
        "unknown_cast": "Distribution Inconnue",
        "no_stream": "Aucun lien de diffusion ni bande-annonce disponible pour ce titre."
    },
    "id": {
        "nav_trending": "Trending",
        "nav_movies": "Film",
        "nav_tv": "Acara TV & Anime",
        "search_placeholder": "Cari Film, Anime, atau Drama...",
        "home": "Beranda",
        "language": "Bahasa",
        "mode": "Mode",
        "download": "Unduh",
        "about_us": "Tentang Kami",
        "select_language": "Pilih Bahasa",
        "lang_note": "Catatan: Judul dan deskripsi diterjemahkan otomatis jika tersedia. Beberapa judul mungkin tetap dalam bahasa aslinya jika tidak ada terjemahan.",
        "cast": "Pemeran:",
        "watch_now": "▶ Tonton Sekarang",
        "download_appname": "AllFLix Android",
        "download_badge": "Segera Hadir",
        "download_text": "Tonton film, episode TV, anime, dan drama lengkap di aplikasi resmi AllFlix.",
        "notify_me": "Beri Tahu Saya",
        "notify_me_done": "Anda akan diberi tahu!",
        "section_trending": "Trending Hari Ini",
        "section_movies": "Film Populer",
        "section_tv": "Acara TV & Anime Populer",
        "brand": "ALLFLIX",
        "footer_about": "Tentang",
        "footer_benefits": "Keuntungan",
        "footer_support": "Dukungan",
        "footer_copy": "© 2026 AllFlix. Hak cipta dilindungi.",
        "no_results": "Tidak ada hasil ditemukan.",
        "results_for": "Hasil untuk",
        "no_overview": "Belum ada ringkasan untuk judul ini.",
        "unknown_cast": "Pemeran Tidak Diketahui",
        "no_stream": "Belum ada tautan streaming atau trailer untuk judul ini."
    },
    "ar": {
        "nav_trending": "الأكثر رواجاً",
        "nav_movies": "أفلام",
        "nav_tv": "مسلسلات وأنمي",
        "search_placeholder": "ابحث عن أفلام أو أنمي أو دراما...",
        "home": "الرئيسية",
        "language": "اللغة",
        "mode": "الوضع",
        "download": "تنزيل",
        "about_us": "من نحن",
        "select_language": "اختر اللغة",
        "lang_note": "ملاحظة: تتم ترجمة العناوين والأوصاف تلقائياً عند توفرها. قد تبقى بعض العناوين بلغتها الأصلية.",
        "cast": "طاقم التمثيل:",
        "watch_now": "▶ شاهد الآن",
        "download_appname": "AllFLix لأندرويد",
        "download_badge": "قريباً",
        "download_text": "شاهد الأفلام وحلقات المسلسلات والأنمي والدراما كاملة على تطبيق AllFlix الرسمي.",
        "notify_me": "أعلمني",
        "notify_me_done": "سيتم إعلامك!",
        "section_trending": "الرائج اليوم",
        "section_movies": "أفلام رائجة",
        "section_tv": "مسلسلات وأنمي رائجة",
        "brand": "أول فليكس",
        "footer_about": "من نحن",
        "footer_benefits": "المزايا",
        "footer_support": "الدعم",
        "footer_copy": "© 2026 AllFlix. جميع الحقوق محفوظة.",
        "no_results": "لم يتم العثور على نتائج.",
        "results_for": "نتائج البحث عن",
        "no_overview": "لا يوجد وصف متاح لهذا العنوان.",
        "unknown_cast": "طاقم تمثيل غير معروف",
        "no_stream": "لا يوجد رابط بث أو مقطع دعائي لهذا العنوان بعد."
    },
    "hi": {
        "nav_trending": "ट्रेंडिंग",
        "nav_movies": "मूवीज़",
        "nav_tv": "टीवी शो और एनीमे",
        "search_placeholder": "मूवी, एनीमे या ड्रामा खोजें...",
        "home": "होम",
        "language": "भाषा",
        "mode": "मोड",
        "download": "डाउनलोड",
        "about_us": "हमारे बारे में",
        "select_language": "भाषा चुनें",
        "lang_note": "नोट: उपलब्ध होने पर शीर्षक और विवरण स्वतः अनुवादित होते हैं। कुछ शीर्षक मूल भाषा में रह सकते हैं।",
        "cast": "कलाकार:",
        "watch_now": "▶ अभी देखें",
        "download_appname": "AllFLix एंड्रॉइड",
        "download_badge": "जल्द आ रहा है",
        "download_text": "आधिकारिक AllFlix ऐप पर पूरी मूवीज़, टीवी एपिसोड, एनीमे और ड्रामा देखें।",
        "notify_me": "मुझे सूचित करें",
        "notify_me_done": "आपको सूचित किया जाएगा!",
        "section_trending": "आज ट्रेंडिंग",
        "section_movies": "लोकप्रिय मूवीज़",
        "section_tv": "लोकप्रिय टीवी शो और एनीमे",
        "brand": "ऑलफ्लिक्स",
        "footer_about": "परिचय",
        "footer_benefits": "लाभ",
        "footer_support": "सहायता",
        "footer_copy": "© 2026 AllFlix. सर्वाधिकार सुरक्षित।",
        "no_results": "कोई परिणाम नहीं मिला।",
        "results_for": "के लिए परिणाम",
        "no_overview": "इस शीर्षक के लिए कोई सारांश उपलब्ध नहीं है।",
        "unknown_cast": "कलाकार अज्ञात",
        "no_stream": "इस शीर्षक के लिए अभी तक कोई स्ट्रीमिंग लिंक या ट्रेलर उपलब्ध नहीं है।"
    },
    "pt": {
        "nav_trending": "Em Alta",
        "nav_movies": "Filmes",
        "nav_tv": "Séries e Anime",
        "search_placeholder": "Buscar filmes, anime ou séries...",
        "home": "Início",
        "language": "Idioma",
        "mode": "Modo",
        "download": "Baixar",
        "about_us": "Sobre Nós",
        "select_language": "Selecionar Idioma",
        "lang_note": "Nota: Títulos e descrições são traduzidos automaticamente quando disponíveis. Alguns títulos podem permanecer no idioma original.",
        "cast": "Elenco:",
        "watch_now": "▶ Assistir Agora",
        "download_appname": "AllFLix Android",
        "download_badge": "Em Breve",
        "download_text": "Assista filmes, episódios de séries, anime e dramas completos no app oficial da AllFlix.",
        "notify_me": "Avise-me",
        "notify_me_done": "Você será avisado!",
        "section_trending": "Em Alta Hoje",
        "section_movies": "Filmes Populares",
        "section_tv": "Séries e Anime Populares",
        "brand": "ALLFLIX",
        "footer_about": "Sobre",
        "footer_benefits": "Benefícios",
        "footer_support": "Suporte",
        "footer_copy": "© 2026 AllFlix. Todos os direitos reservados.",
        "no_results": "Nenhum resultado encontrado.",
        "results_for": "Resultados para",
        "no_overview": "Nenhuma sinopse disponível para este título.",
        "unknown_cast": "Elenco Desconhecido",
        "no_stream": "Ainda não há link de streaming ou trailer para este título."
    },
    "de": {
        "nav_trending": "Trends",
        "nav_movies": "Filme",
        "nav_tv": "Serien & Anime",
        "search_placeholder": "Filme, Anime oder Dramen suchen...",
        "home": "Start",
        "language": "Sprache",
        "mode": "Modus",
        "download": "Herunterladen",
        "about_us": "Über Uns",
        "select_language": "Sprache Wählen",
        "lang_note": "Hinweis: Titel und Beschreibungen werden automatisch übersetzt, sofern verfügbar. Manche Titel bleiben in der Originalsprache.",
        "cast": "Besetzung:",
        "watch_now": "▶ Jetzt Ansehen",
        "download_appname": "AllFLix Android",
        "download_badge": "Demnächst",
        "download_text": "Sieh dir vollständige Filme, TV-Episoden, Anime und Dramen in der offiziellen AllFlix-App an.",
        "notify_me": "Benachrichtigen",
        "notify_me_done": "Du wirst benachrichtigt!",
        "section_trending": "Heute im Trend",
        "section_movies": "Beliebte Filme",
        "section_tv": "Beliebte Serien & Anime",
        "brand": "ALLFLIX",
        "footer_about": "Über Uns",
        "footer_benefits": "Vorteile",
        "footer_support": "Support",
        "footer_copy": "© 2026 AllFlix. Alle Rechte vorbehalten.",
        "no_results": "Keine Ergebnisse gefunden.",
        "results_for": "Ergebnisse für",
        "no_overview": "Keine Zusammenfassung für diesen Titel verfügbar.",
        "unknown_cast": "Besetzung Unbekannt",
        "no_stream": "Für diesen Titel ist noch kein Streaming-Link oder Trailer verfügbar."
    },
    "it": {
        "nav_trending": "Tendenze",
        "nav_movies": "Film",
        "nav_tv": "Serie e Anime",
        "search_placeholder": "Cerca film, anime o serie...",
        "home": "Home",
        "language": "Lingua",
        "mode": "Modalità",
        "download": "Scarica",
        "about_us": "Chi Siamo",
        "select_language": "Seleziona Lingua",
        "lang_note": "Nota: titoli e descrizioni vengono tradotti automaticamente quando disponibili. Alcuni titoli potrebbero restare nella lingua originale.",
        "cast": "Cast:",
        "watch_now": "▶ Guarda Ora",
        "download_appname": "AllFLix Android",
        "download_badge": "Prossimamente",
        "download_text": "Guarda film, episodi TV, anime e drama completi sull'app ufficiale AllFlix.",
        "notify_me": "Avvisami",
        "notify_me_done": "Sarai avvisato!",
        "section_trending": "Tendenze di Oggi",
        "section_movies": "Film Popolari",
        "section_tv": "Serie e Anime Popolari",
        "brand": "ALLFLIX",
        "footer_about": "Chi Siamo",
        "footer_benefits": "Vantaggi",
        "footer_support": "Assistenza",
        "footer_copy": "© 2026 AllFlix. Tutti i diritti riservati.",
        "no_results": "Nessun risultato trovato.",
        "results_for": "Risultati per",
        "no_overview": "Nessuna trama disponibile per questo titolo.",
        "unknown_cast": "Cast Sconosciuto",
        "no_stream": "Nessun link di streaming o trailer disponibile per questo titolo."
    },
    "ru": {
        "nav_trending": "В тренде",
        "nav_movies": "Фильмы",
        "nav_tv": "Сериалы и аниме",
        "search_placeholder": "Поиск фильмов, аниме или сериалов...",
        "home": "Главная",
        "language": "Язык",
        "mode": "Режим",
        "download": "Скачать",
        "about_us": "О нас",
        "select_language": "Выберите язык",
        "lang_note": "Примечание: названия и описания переводятся автоматически, если перевод доступен. Некоторые названия могут остаться на языке оригинала.",
        "cast": "В ролях:",
        "watch_now": "▶ Смотреть",
        "download_appname": "AllFLix Android",
        "download_badge": "Скоро",
        "download_text": "Смотрите фильмы, сериалы, аниме и дорамы полностью в официальном приложении AllFlix.",
        "notify_me": "Уведомить меня",
        "notify_me_done": "Вы будете уведомлены!",
        "section_trending": "В тренде сегодня",
        "section_movies": "Популярные фильмы",
        "section_tv": "Популярные сериалы и аниме",
        "brand": "Оллфликс",
        "footer_about": "О нас",
        "footer_benefits": "Преимущества",
        "footer_support": "Поддержка",
        "footer_copy": "© 2026 AllFlix. Все права защищены.",
        "no_results": "Результаты не найдены.",
        "results_for": "Результаты по запросу",
        "no_overview": "Описание для этого тайтла недоступно.",
        "unknown_cast": "Актёрский состав неизвестен",
        "no_stream": "Для этого тайтла пока нет ссылки на просмотр или трейлера."
    },
    "vi": {
        "nav_trending": "Thịnh Hành",
        "nav_movies": "Phim Lẻ",
        "nav_tv": "Phim Bộ & Anime",
        "search_placeholder": "Tìm phim, anime hoặc phim bộ...",
        "home": "Trang Chủ",
        "language": "Ngôn Ngữ",
        "mode": "Chế Độ",
        "download": "Tải Xuống",
        "about_us": "Về Chúng Tôi",
        "select_language": "Chọn Ngôn Ngữ",
        "lang_note": "Lưu ý: Tiêu đề và mô tả sẽ tự động được dịch nếu có sẵn. Một số tiêu đề có thể vẫn giữ ngôn ngữ gốc.",
        "cast": "Diễn Viên:",
        "watch_now": "▶ Xem Ngay",
        "download_appname": "AllFLix Android",
        "download_badge": "Sắp Ra Mắt",
        "download_text": "Xem trọn bộ phim, tập phim, anime và phim bộ trên ứng dụng AllFlix chính thức.",
        "notify_me": "Báo Cho Tôi",
        "notify_me_done": "Bạn sẽ được thông báo!",
        "section_trending": "Thịnh Hành Hôm Nay",
        "section_movies": "Phim Lẻ Phổ Biến",
        "section_tv": "Phim Bộ & Anime Phổ Biến",
        "brand": "ALLFLIX",
        "footer_about": "Giới Thiệu",
        "footer_benefits": "Lợi Ích",
        "footer_support": "Hỗ Trợ",
        "footer_copy": "© 2026 AllFlix. Đã đăng ký bản quyền.",
        "no_results": "Không tìm thấy kết quả.",
        "results_for": "Kết quả cho",
        "no_overview": "Chưa có tóm tắt cho tựa đề này.",
        "unknown_cast": "Chưa Rõ Diễn Viên",
        "no_stream": "Chưa có liên kết xem trực tuyến hoặc trailer cho tựa đề này."
    },
    "th": {
        "nav_trending": "กำลังมาแรง",
        "nav_movies": "ภาพยนตร์",
        "nav_tv": "ซีรีส์และอนิเมะ",
        "search_placeholder": "ค้นหาภาพยนตร์ อนิเมะ หรือละคร...",
        "home": "หน้าแรก",
        "language": "ภาษา",
        "mode": "โหมด",
        "download": "ดาวน์โหลด",
        "about_us": "เกี่ยวกับเรา",
        "select_language": "เลือกภาษา",
        "lang_note": "หมายเหตุ: ชื่อเรื่องและคำอธิบายจะแปลอัตโนมัติเมื่อมีคำแปล บางชื่ออาจยังคงเป็นภาษาต้นฉบับ",
        "cast": "นักแสดง:",
        "watch_now": "▶ ดูเลย",
        "download_appname": "AllFLix สำหรับแอนดรอยด์",
        "download_badge": "เร็วๆ นี้",
        "download_text": "รับชมภาพยนตร์ ซีรีส์ อนิเมะ และละครเต็มเรื่องบนแอป AllFlix อย่างเป็นทางการ",
        "notify_me": "แจ้งเตือนฉัน",
        "notify_me_done": "คุณจะได้รับการแจ้งเตือน!",
        "section_trending": "กำลังมาแรงวันนี้",
        "section_movies": "ภาพยนตร์ยอดนิยม",
        "section_tv": "ซีรีส์และอนิเมะยอดนิยม",
        "brand": "ออลฟลิกซ์",
        "footer_about": "เกี่ยวกับ",
        "footer_benefits": "สิทธิประโยชน์",
        "footer_support": "สนับสนุน",
        "footer_copy": "© 2026 AllFlix สงวนลิขสิทธิ์",
        "no_results": "ไม่พบผลลัพธ์",
        "results_for": "ผลการค้นหาสำหรับ",
        "no_overview": "ไม่มีเรื่องย่อสำหรับเรื่องนี้",
        "unknown_cast": "ไม่ทราบนักแสดง",
        "no_stream": "ยังไม่มีลิงก์สตรีมมิ่งหรือตัวอย่างสำหรับเรื่องนี้"
    },
    "tr": {
        "nav_trending": "Trend",
        "nav_movies": "Filmler",
        "nav_tv": "Diziler ve Anime",
        "search_placeholder": "Film, anime veya dizi ara...",
        "home": "Ana Sayfa",
        "language": "Dil",
        "mode": "Mod",
        "download": "İndir",
        "about_us": "Hakkımızda",
        "select_language": "Dil Seç",
        "lang_note": "Not: Başlık ve açıklamalar mevcut olduğunda otomatik çevrilir. Bazı başlıklar orijinal dilinde kalabilir.",
        "cast": "Oyuncular:",
        "watch_now": "▶ Şimdi İzle",
        "download_appname": "AllFLix Android",
        "download_badge": "Yakında",
        "download_text": "Resmi AllFlix uygulamasında tam filmleri, dizi bölümlerini, animeleri ve dramaları izleyin.",
        "notify_me": "Beni Bilgilendir",
        "notify_me_done": "Bilgilendirileceksiniz!",
        "section_trending": "Bugün Trend",
        "section_movies": "Popüler Filmler",
        "section_tv": "Popüler Diziler ve Anime",
        "brand": "ALLFLIX",
        "footer_about": "Hakkında",
        "footer_benefits": "Avantajlar",
        "footer_support": "Destek",
        "footer_copy": "© 2026 AllFlix. Tüm hakları saklıdır.",
        "no_results": "Sonuç bulunamadı.",
        "results_for": "Sonuçlar",
        "no_overview": "Bu yapım için özet bulunmuyor.",
        "unknown_cast": "Oyuncular Bilinmiyor",
        "no_stream": "Bu içerik için henüz izleme bağlantısı veya fragman yok."
    },
    "nl": {
        "nav_trending": "Trending",
        "nav_movies": "Films",
        "nav_tv": "Series & Anime",
        "search_placeholder": "Zoek films, anime of series...",
        "home": "Home",
        "language": "Taal",
        "mode": "Modus",
        "download": "Downloaden",
        "about_us": "Over Ons",
        "select_language": "Taal Selecteren",
        "lang_note": "Let op: titels en beschrijvingen worden automatisch vertaald indien beschikbaar. Sommige titels blijven mogelijk in de originele taal.",
        "cast": "Cast:",
        "watch_now": "▶ Nu Kijken",
        "download_appname": "AllFLix Android",
        "download_badge": "Binnenkort",
        "download_text": "Bekijk volledige films, tv-afleveringen, anime en drama's in de officiële AllFlix-app.",
        "notify_me": "Informeer Mij",
        "notify_me_done": "Je wordt op de hoogte gehouden!",
        "section_trending": "Vandaag Trending",
        "section_movies": "Populaire Films",
        "section_tv": "Populaire Series & Anime",
        "brand": "ALLFLIX",
        "footer_about": "Over Ons",
        "footer_benefits": "Voordelen",
        "footer_support": "Ondersteuning",
        "footer_copy": "© 2026 AllFlix. Alle rechten voorbehouden.",
        "no_results": "Geen resultaten gevonden.",
        "results_for": "Resultaten voor",
        "no_overview": "Geen samenvatting beschikbaar voor deze titel.",
        "unknown_cast": "Cast Onbekend",
        "no_stream": "Nog geen streaminglink of trailer beschikbaar voor deze titel."
    },
    "pl": {
        "nav_trending": "Popularne",
        "nav_movies": "Filmy",
        "nav_tv": "Seriale i Anime",
        "search_placeholder": "Szukaj filmów, anime lub seriali...",
        "home": "Start",
        "language": "Język",
        "mode": "Tryb",
        "download": "Pobierz",
        "about_us": "O Nas",
        "select_language": "Wybierz Język",
        "lang_note": "Uwaga: tytuły i opisy są automatycznie tłumaczone, jeśli dostępne. Niektóre tytuły mogą pozostać w języku oryginalnym.",
        "cast": "Obsada:",
        "watch_now": "▶ Oglądaj Teraz",
        "download_appname": "AllFLix na Androida",
        "download_badge": "Wkrótce",
        "download_text": "Oglądaj pełne filmy, odcinki seriali, anime i dramy w oficjalnej aplikacji AllFlix.",
        "notify_me": "Powiadom Mnie",
        "notify_me_done": "Zostaniesz powiadomiony!",
        "section_trending": "Popularne Dzisiaj",
        "section_movies": "Popularne Filmy",
        "section_tv": "Popularne Seriale i Anime",
        "brand": "ALLFLIX",
        "footer_about": "O Nas",
        "footer_benefits": "Korzyści",
        "footer_support": "Wsparcie",
        "footer_copy": "© 2026 AllFlix. Wszelkie prawa zastrzeżone.",
        "no_results": "Nie znaleziono wyników.",
        "results_for": "Wyniki dla",
        "no_overview": "Brak opisu dla tego tytułu.",
        "unknown_cast": "Nieznana Obsada",
        "no_stream": "Brak jeszcze linku do streamingu lub zwiastuna dla tego tytułu."
    },
    "sv": {
        "nav_trending": "Trender",
        "nav_movies": "Filmer",
        "nav_tv": "Serier & Anime",
        "search_placeholder": "Sök filmer, anime eller serier...",
        "home": "Hem",
        "language": "Språk",
        "mode": "Läge",
        "download": "Ladda Ner",
        "about_us": "Om Oss",
        "select_language": "Välj Språk",
        "lang_note": "Obs: titlar och beskrivningar översätts automatiskt när det finns tillgängligt. Vissa titlar kan förbli på originalspråket.",
        "cast": "Skådespelare:",
        "watch_now": "▶ Titta Nu",
        "download_appname": "AllFLix Android",
        "download_badge": "Kommer Snart",
        "download_text": "Titta på kompletta filmer, tv-avsnitt, anime och dramaserier i den officiella AllFlix-appen.",
        "notify_me": "Meddela Mig",
        "notify_me_done": "Du kommer att meddelas!",
        "section_trending": "Trender Idag",
        "section_movies": "Populära Filmer",
        "section_tv": "Populära Serier & Anime",
        "brand": "ALLFLIX",
        "footer_about": "Om Oss",
        "footer_benefits": "Fördelar",
        "footer_support": "Support",
        "footer_copy": "© 2026 AllFlix. Alla rättigheter förbehållna.",
        "no_results": "Inga resultat hittades.",
        "results_for": "Resultat för",
        "no_overview": "Ingen sammanfattning tillgänglig för denna titel.",
        "unknown_cast": "Okänd Skådespelare",
        "no_stream": "Ingen strömningslänk eller trailer tillgänglig för denna titel än."
    },
    "no": {
        "nav_trending": "Populært",
        "nav_movies": "Filmer",
        "nav_tv": "Serier & Anime",
        "search_placeholder": "Søk etter filmer, anime eller serier...",
        "home": "Hjem",
        "language": "Språk",
        "mode": "Modus",
        "download": "Last Ned",
        "about_us": "Om Oss",
        "select_language": "Velg Språk",
        "lang_note": "Merk: titler og beskrivelser oversettes automatisk når tilgjengelig. Enkelte titler kan forbli på originalspråket.",
        "cast": "Skuespillere:",
        "watch_now": "▶ Se Nå",
        "download_appname": "AllFLix Android",
        "download_badge": "Kommer Snart",
        "download_text": "Se komplette filmer, TV-episoder, anime og dramaer i den offisielle AllFlix-appen.",
        "notify_me": "Varsle Meg",
        "notify_me_done": "Du vil bli varslet!",
        "section_trending": "Populært I Dag",
        "section_movies": "Populære Filmer",
        "section_tv": "Populære Serier & Anime",
        "brand": "ALLFLIX",
        "footer_about": "Om Oss",
        "footer_benefits": "Fordeler",
        "footer_support": "Kundestøtte",
        "footer_copy": "© 2026 AllFlix. Alle rettigheter forbeholdt.",
        "no_results": "Ingen resultater funnet.",
        "results_for": "Resultater for",
        "no_overview": "Ingen sammendrag tilgjengelig for denne tittelen.",
        "unknown_cast": "Ukjent Skuespiller",
        "no_stream": "Ingen strømmelenke eller trailer tilgjengelig for denne tittelen ennå."
    },
    "da": {
        "nav_trending": "Populært",
        "nav_movies": "Film",
        "nav_tv": "Serier & Anime",
        "search_placeholder": "Søg efter film, anime eller serier...",
        "home": "Hjem",
        "language": "Sprog",
        "mode": "Tilstand",
        "download": "Download",
        "about_us": "Om Os",
        "select_language": "Vælg Sprog",
        "lang_note": "Bemærk: titler og beskrivelser oversættes automatisk, når det er muligt. Nogle titler kan forblive på originalsproget.",
        "cast": "Medvirkende:",
        "watch_now": "▶ Se Nu",
        "download_appname": "AllFLix Android",
        "download_badge": "Kommer Snart",
        "download_text": "Se hele film, tv-episoder, anime og dramaer i den officielle AllFlix-app.",
        "notify_me": "Giv Mig Besked",
        "notify_me_done": "Du vil blive underrettet!",
        "section_trending": "Populært I Dag",
        "section_movies": "Populære Film",
        "section_tv": "Populære Serier & Anime",
        "brand": "ALLFLIX",
        "footer_about": "Om Os",
        "footer_benefits": "Fordele",
        "footer_support": "Support",
        "footer_copy": "© 2026 AllFlix. Alle rettigheder forbeholdes.",
        "no_results": "Ingen resultater fundet.",
        "results_for": "Resultater for",
        "no_overview": "Ingen beskrivelse tilgængelig for denne titel.",
        "unknown_cast": "Ukendte Medvirkende",
        "no_stream": "Endnu intet streaminglink eller trailer tilgængelig for denne titel."
    },
    "fi": {
        "nav_trending": "Suositut",
        "nav_movies": "Elokuvat",
        "nav_tv": "Sarjat & Anime",
        "search_placeholder": "Hae elokuvia, animea tai sarjoja...",
        "home": "Koti",
        "language": "Kieli",
        "mode": "Tila",
        "download": "Lataa",
        "about_us": "Tietoa Meistä",
        "select_language": "Valitse Kieli",
        "lang_note": "Huom: nimet ja kuvaukset käännetään automaattisesti, kun käännös on saatavilla. Osa nimistä voi jäädä alkuperäiskielelle.",
        "cast": "Näyttelijät:",
        "watch_now": "▶ Katso Nyt",
        "download_appname": "AllFLix Android",
        "download_badge": "Tulossa Pian",
        "download_text": "Katso kokonaisia elokuvia, TV-jaksoja, animea ja draamoja virallisessa AllFlix-sovelluksessa.",
        "notify_me": "Ilmoita Minulle",
        "notify_me_done": "Sinulle ilmoitetaan!",
        "section_trending": "Suositut Tänään",
        "section_movies": "Suositut Elokuvat",
        "section_tv": "Suositut Sarjat & Anime",
        "brand": "ALLFLIX",
        "footer_about": "Tietoa",
        "footer_benefits": "Edut",
        "footer_support": "Tuki",
        "footer_copy": "© 2026 AllFlix. Kaikki oikeudet pidätetään.",
        "no_results": "Tuloksia ei löytynyt.",
        "results_for": "Hakutulokset",
        "no_overview": "Tälle nimikkeelle ei ole kuvausta.",
        "unknown_cast": "Näyttelijät Tuntemattomia",
        "no_stream": "Tälle nimikkeelle ei ole vielä suoratoistolinkkiä tai traileria."
    },
    "el": {
        "nav_trending": "Τάσεις",
        "nav_movies": "Ταινίες",
        "nav_tv": "Σειρές & Anime",
        "search_placeholder": "Αναζήτηση ταινιών, anime ή σειρών...",
        "home": "Αρχική",
        "language": "Γλώσσα",
        "mode": "Λειτουργία",
        "download": "Λήψη",
        "about_us": "Σχετικά Με Εμάς",
        "select_language": "Επιλογή Γλώσσας",
        "lang_note": "Σημείωση: οι τίτλοι και οι περιγραφές μεταφράζονται αυτόματα όταν είναι διαθέσιμοι. Ορισμένοι τίτλοι μπορεί να παραμείνουν στην αρχική γλώσσα.",
        "cast": "Πρωταγωνιστές:",
        "watch_now": "▶ Παρακολούθηση",
        "download_appname": "AllFLix για Android",
        "download_badge": "Σύντομα",
        "download_text": "Παρακολουθήστε ολόκληρες ταινίες, επεισόδια σειρών, anime και δράματα στην επίσημη εφαρμογή AllFlix.",
        "notify_me": "Ειδοποίησέ Με",
        "notify_me_done": "Θα ειδοποιηθείτε!",
        "section_trending": "Σήμερα Στις Τάσεις",
        "section_movies": "Δημοφιλείς Ταινίες",
        "section_tv": "Δημοφιλείς Σειρές & Anime",
        "brand": "Όλφλιξ",
        "footer_about": "Σχετικά",
        "footer_benefits": "Οφέλη",
        "footer_support": "Υποστήριξη",
        "footer_copy": "© 2026 AllFlix. Με επιφύλαξη παντός δικαιώματος.",
        "no_results": "Δεν βρέθηκαν αποτελέσματα.",
        "results_for": "Αποτελέσματα για",
        "no_overview": "Δεν υπάρχει διαθέσιμη περίληψη για αυτόν τον τίτλο.",
        "unknown_cast": "Άγνωστοι Πρωταγωνιστές",
        "no_stream": "Δεν υπάρχει ακόμη σύνδεσμος ροής ή τρέιλερ για αυτόν τον τίτλο."
    },
    "he": {
        "nav_trending": "פופולרי",
        "nav_movies": "סרטים",
        "nav_tv": "סדרות ואנימה",
        "search_placeholder": "חפש סרטים, אנימה או דרמות...",
        "home": "בית",
        "language": "שפה",
        "mode": "מצב",
        "download": "הורדה",
        "about_us": "אודותינו",
        "select_language": "בחר שפה",
        "lang_note": "הערה: כותרות ותיאורים מתורגמים אוטומטית כאשר קיים תרגום. חלק מהכותרות עשויות להישאר בשפת המקור.",
        "cast": "שחקנים:",
        "watch_now": "▶ צפה עכשיו",
        "download_appname": "AllFLix לאנדרואיד",
        "download_badge": "בקרוב",
        "download_text": "צפו בסרטים, פרקי טלוויזיה, אנימה ודרמות מלאים באפליקציית AllFlix הרשמית.",
        "notify_me": "עדכנו אותי",
        "notify_me_done": "תקבלו עדכון!",
        "section_trending": "פופולרי היום",
        "section_movies": "סרטים פופולריים",
        "section_tv": "סדרות ואנימה פופולריות",
        "brand": "אולפליקס",
        "footer_about": "אודות",
        "footer_benefits": "יתרונות",
        "footer_support": "תמיכה",
        "footer_copy": "© 2026 AllFlix. כל הזכויות שמורות.",
        "no_results": "לא נמצאו תוצאות.",
        "results_for": "תוצאות עבור",
        "no_overview": "אין תקציר זמין לכותר זה.",
        "unknown_cast": "שחקנים לא ידועים",
        "no_stream": "עדיין אין קישור צפייה או טריילר לכותר זה."
    },
    "uk": {
        "nav_trending": "У тренді",
        "nav_movies": "Фільми",
        "nav_tv": "Серіали та аніме",
        "search_placeholder": "Пошук фільмів, аніме або серіалів...",
        "home": "Головна",
        "language": "Мова",
        "mode": "Режим",
        "download": "Завантажити",
        "about_us": "Про Нас",
        "select_language": "Виберіть Мову",
        "lang_note": "Примітка: назви й описи перекладаються автоматично, якщо доступно. Деякі назви можуть залишатися мовою оригіналу.",
        "cast": "У ролях:",
        "watch_now": "▶ Дивитися",
        "download_appname": "AllFLix Android",
        "download_badge": "Незабаром",
        "download_text": "Дивіться повні фільми, серіали, аніме та дорами в офіційному застосунку AllFlix.",
        "notify_me": "Повідомити Мене",
        "notify_me_done": "Вас буде повідомлено!",
        "section_trending": "У тренді сьогодні",
        "section_movies": "Популярні фільми",
        "section_tv": "Популярні серіали та аніме",
        "brand": "Оллфлікс",
        "footer_about": "Про нас",
        "footer_benefits": "Переваги",
        "footer_support": "Підтримка",
        "footer_copy": "© 2026 AllFlix. Всі права захищено.",
        "no_results": "Результатів не знайдено.",
        "results_for": "Результати за запитом",
        "no_overview": "Опис для цього тайтлу недоступний.",
        "unknown_cast": "Акторський склад невідомий",
        "no_stream": "Для цього тайтлу ще немає посилання на перегляд або трейлера."
    },
    "cs": {
        "nav_trending": "Populární",
        "nav_movies": "Filmy",
        "nav_tv": "Seriály a Anime",
        "search_placeholder": "Hledat filmy, anime nebo seriály...",
        "home": "Domů",
        "language": "Jazyk",
        "mode": "Režim",
        "download": "Stáhnout",
        "about_us": "O Nás",
        "select_language": "Vybrat Jazyk",
        "lang_note": "Poznámka: názvy a popisy jsou automaticky přeloženy, pokud jsou k dispozici. Některé názvy mohou zůstat v původním jazyce.",
        "cast": "Obsazení:",
        "watch_now": "▶ Sledovat Nyní",
        "download_appname": "AllFLix pro Android",
        "download_badge": "Již Brzy",
        "download_text": "Sledujte celé filmy, epizody seriálů, anime a dramata v oficiální aplikaci AllFlix.",
        "notify_me": "Upozornit Mě",
        "notify_me_done": "Budete upozorněni!",
        "section_trending": "Populární Dnes",
        "section_movies": "Oblíbené Filmy",
        "section_tv": "Oblíbené Seriály a Anime",
        "brand": "ALLFLIX",
        "footer_about": "O Nás",
        "footer_benefits": "Výhody",
        "footer_support": "Podpora",
        "footer_copy": "© 2026 AllFlix. Všechna práva vyhrazena.",
        "no_results": "Nebyly nalezeny žádné výsledky.",
        "results_for": "Výsledky pro",
        "no_overview": "Pro tento titul není k dispozici žádný popis.",
        "unknown_cast": "Neznámé Obsazení",
        "no_stream": "Pro tento titul zatím není k dispozici odkaz na streamování ani trailer."
    },
    "hu": {
        "nav_trending": "Trendek",
        "nav_movies": "Filmek",
        "nav_tv": "Sorozatok és Anime",
        "search_placeholder": "Filmek, anime vagy sorozatok keresése...",
        "home": "Kezdőlap",
        "language": "Nyelv",
        "mode": "Mód",
        "download": "Letöltés",
        "about_us": "Rólunk",
        "select_language": "Nyelv Kiválasztása",
        "lang_note": "Megjegyzés: a címek és leírások automatikusan lefordításra kerülnek, ha elérhetők. Egyes címek megmaradhatnak eredeti nyelven.",
        "cast": "Szereplők:",
        "watch_now": "▶ Megnézem Most",
        "download_appname": "AllFLix Android",
        "download_badge": "Hamarosan",
        "download_text": "Nézz teljes filmeket, sorozatepizódokat, animét és drámákat a hivatalos AllFlix alkalmazásban.",
        "notify_me": "Értesítést Kérek",
        "notify_me_done": "Értesítünk!",
        "section_trending": "Ma Trendi",
        "section_movies": "Népszerű Filmek",
        "section_tv": "Népszerű Sorozatok és Anime",
        "brand": "ALLFLIX",
        "footer_about": "Rólunk",
        "footer_benefits": "Előnyök",
        "footer_support": "Támogatás",
        "footer_copy": "© 2026 AllFlix. Minden jog fenntartva.",
        "no_results": "Nincs találat.",
        "results_for": "Találatok erre",
        "no_overview": "Ehhez a címhez nem érhető el összefoglaló.",
        "unknown_cast": "Ismeretlen Szereplők",
        "no_stream": "Ehhez a címhez még nincs elérhető streamlink vagy előzetes."
    },
    "ro": {
        "nav_trending": "Populare",
        "nav_movies": "Filme",
        "nav_tv": "Seriale și Anime",
        "search_placeholder": "Caută filme, anime sau seriale...",
        "home": "Acasă",
        "language": "Limbă",
        "mode": "Mod",
        "download": "Descarcă",
        "about_us": "Despre Noi",
        "select_language": "Selectează Limba",
        "lang_note": "Notă: titlurile și descrierile sunt traduse automat atunci când sunt disponibile. Unele titluri pot rămâne în limba originală.",
        "cast": "Distribuție:",
        "watch_now": "▶ Vezi Acum",
        "download_appname": "AllFLix pentru Android",
        "download_badge": "În Curând",
        "download_text": "Urmărește filme, episoade TV, anime și drame complete în aplicația oficială AllFlix.",
        "notify_me": "Anunță-mă",
        "notify_me_done": "Vei fi anunțat!",
        "section_trending": "Populare Azi",
        "section_movies": "Filme Populare",
        "section_tv": "Seriale și Anime Populare",
        "brand": "ALLFLIX",
        "footer_about": "Despre",
        "footer_benefits": "Beneficii",
        "footer_support": "Asistență",
        "footer_copy": "© 2026 AllFlix. Toate drepturile rezervate.",
        "no_results": "Niciun rezultat găsit.",
        "results_for": "Rezultate pentru",
        "no_overview": "Niciun rezumat disponibil pentru acest titlu.",
        "unknown_cast": "Distribuție Necunoscută",
        "no_stream": "Nu există încă un link de streaming sau un trailer pentru acest titlu."
    },
    "bn": {
        "nav_trending": "ট্রেন্ডিং",
        "nav_movies": "মুভি",
        "nav_tv": "টিভি শো ও অ্যানিমে",
        "search_placeholder": "মুভি, অ্যানিমে বা ড্রামা খুঁজুন...",
        "home": "হোম",
        "language": "ভাষা",
        "mode": "মোড",
        "download": "ডাউনলোড",
        "about_us": "আমাদের সম্পর্কে",
        "select_language": "ভাষা নির্বাচন করুন",
        "lang_note": "দ্রষ্টব্য: শিরোনাম ও বিবরণ পাওয়া গেলে স্বয়ংক্রিয়ভাবে অনুবাদ হয়। কিছু শিরোনাম মূল ভাষায় থাকতে পারে।",
        "cast": "অভিনয়শিল্পী:",
        "watch_now": "▶ এখনই দেখুন",
        "download_appname": "AllFLix অ্যান্ড্রয়েড",
        "download_badge": "শীঘ্রই আসছে",
        "download_text": "অফিসিয়াল AllFlix অ্যাপে সম্পূর্ণ মুভি, টিভি এপিসোড, অ্যানিমে ও ড্রামা দেখুন।",
        "notify_me": "আমাকে জানান",
        "notify_me_done": "আপনাকে জানানো হবে!",
        "section_trending": "আজকের ট্রেন্ডিং",
        "section_movies": "জনপ্রিয় মুভি",
        "section_tv": "জনপ্রিয় টিভি শো ও অ্যানিমে",
        "brand": "অলফ্লিক্স",
        "footer_about": "পরিচিতি",
        "footer_benefits": "সুবিধা",
        "footer_support": "সহায়তা",
        "footer_copy": "© 2026 AllFlix. সর্বস্বত্ব সংরক্ষিত।",
        "no_results": "কোনো ফলাফল পাওয়া যায়নি।",
        "results_for": "ফলাফল",
        "no_overview": "এই শিরোনামের জন্য কোনো সারাংশ নেই।",
        "unknown_cast": "অজানা অভিনয়শিল্পী",
        "no_stream": "এই শিরোনামের জন্য এখনো কোনো স্ট্রিমিং লিংক বা ট্রেলার নেই।"
    },
    "ur": {
        "nav_trending": "ٹرینڈنگ",
        "nav_movies": "فلمیں",
        "nav_tv": "ٹی وی شوز اور اینیمے",
        "search_placeholder": "فلمیں، اینیمے یا ڈرامہ تلاش کریں...",
        "home": "ہوم",
        "language": "زبان",
        "mode": "موڈ",
        "download": "ڈاؤن لوڈ",
        "about_us": "ہمارے بارے میں",
        "select_language": "زبان منتخب کریں",
        "lang_note": "نوٹ: عنوانات اور تفصیلات دستیاب ہونے پر خودکار طور پر ترجمہ ہو جاتی ہیں۔ کچھ عنوانات اصل زبان میں رہ سکتے ہیں۔",
        "cast": "اداکار:",
        "watch_now": "▶ ابھی دیکھیں",
        "download_appname": "AllFLix اینڈرائیڈ",
        "download_badge": "جلد آرہا ہے",
        "download_text": "آفیشل AllFlix ایپ پر مکمل فلمیں، ٹی وی اقساط، اینیمے اور ڈرامے دیکھیں۔",
        "notify_me": "مجھے مطلع کریں",
        "notify_me_done": "آپ کو مطلع کیا جائے گا!",
        "section_trending": "آج ٹرینڈنگ",
        "section_movies": "مقبول فلمیں",
        "section_tv": "مقبول ٹی وی شوز اور اینیمے",
        "brand": "آل فلکس",
        "footer_about": "تعارف",
        "footer_benefits": "فوائد",
        "footer_support": "معاونت",
        "footer_copy": "© 2026 AllFlix۔ جملہ حقوق محفوظ ہیں۔",
        "no_results": "کوئی نتیجہ نہیں ملا۔",
        "results_for": "کے نتائج",
        "no_overview": "اس عنوان کے لیے کوئی خلاصہ دستیاب نہیں۔",
        "unknown_cast": "نامعلوم اداکار",
        "no_stream": "اس عنوان کے لیے ابھی تک کوئی سٹریمنگ لنک یا ٹریلر دستیاب نہیں۔"
    },
    "ms": {
        "nav_trending": "Trending",
        "nav_movies": "Filem",
        "nav_tv": "Rancangan TV & Anime",
        "search_placeholder": "Cari filem, anime, atau drama...",
        "home": "Laman Utama",
        "language": "Bahasa",
        "mode": "Mod",
        "download": "Muat Turun",
        "about_us": "Tentang Kami",
        "select_language": "Pilih Bahasa",
        "lang_note": "Nota: Tajuk dan penerangan diterjemah secara automatik jika tersedia. Sesetengah tajuk mungkin kekal dalam bahasa asal.",
        "cast": "Pelakon:",
        "watch_now": "▶ Tonton Sekarang",
        "download_appname": "AllFLix Android",
        "download_badge": "Akan Datang",
        "download_text": "Tonton filem, episod TV, anime, dan drama penuh di aplikasi rasmi AllFlix.",
        "notify_me": "Maklumkan Saya",
        "notify_me_done": "Anda akan dimaklumkan!",
        "section_trending": "Trending Hari Ini",
        "section_movies": "Filem Popular",
        "section_tv": "Rancangan TV & Anime Popular",
        "brand": "ALLFLIX",
        "footer_about": "Tentang",
        "footer_benefits": "Faedah",
        "footer_support": "Sokongan",
        "footer_copy": "© 2026 AllFlix. Hak cipta terpelihara.",
        "no_results": "Tiada hasil ditemui.",
        "results_for": "Hasil untuk",
        "no_overview": "Tiada sinopsis tersedia untuk tajuk ini.",
        "unknown_cast": "Pelakon Tidak Diketahui",
        "no_stream": "Belum ada pautan strim atau treler untuk tajuk ini."
    },
    "sw": {
        "nav_trending": "Yanayovuma",
        "nav_movies": "Filamu",
        "nav_tv": "Vipindi vya TV na Anime",
        "search_placeholder": "Tafuta Filamu, Anime, au Tamthilia...",
        "home": "Nyumbani",
        "language": "Lugha",
        "mode": "Hali",
        "download": "Pakua",
        "about_us": "Kuhusu Sisi",
        "select_language": "Chagua Lugha",
        "lang_note": "Kumbuka: Majina na maelezo hutafsiriwa kiotomatiki yakipatikana. Baadhi ya majina yanaweza kubaki katika lugha asili.",
        "cast": "Waigizaji:",
        "watch_now": "▶ Tazama Sasa",
        "download_appname": "AllFLix ya Android",
        "download_badge": "Inakuja Hivi Karibuni",
        "download_text": "Tazama filamu kamili, vipindi vya TV, anime, na tamthilia kwenye programu rasmi ya AllFlix.",
        "notify_me": "Nijulishe",
        "notify_me_done": "Utajulishwa!",
        "section_trending": "Yanayovuma Leo",
        "section_movies": "Filamu Maarufu",
        "section_tv": "Vipindi vya TV na Anime Maarufu",
        "brand": "ALLFLIX",
        "footer_about": "Kuhusu",
        "footer_benefits": "Faida",
        "footer_support": "Msaada",
        "footer_copy": "© 2026 AllFlix. Haki zote zimehifadhiwa.",
        "no_results": "Hakuna matokeo yaliyopatikana.",
        "results_for": "Matokeo ya",
        "no_overview": "Hakuna muhtasari uliopatikana kwa kichwa hiki.",
        "unknown_cast": "Waigizaji Hawajulikani",
        "no_stream": "Bado hakuna kiungo cha kutiririsha au trela kwa kichwa hiki."
    },
    "fa": {
        "nav_trending": "پرطرفدار",
        "nav_movies": "فیلم‌ها",
        "nav_tv": "سریال‌ها و انیمه",
        "search_placeholder": "جستجوی فیلم، انیمه یا سریال...",
        "home": "خانه",
        "language": "زبان",
        "mode": "حالت",
        "download": "دانلود",
        "about_us": "درباره ما",
        "select_language": "انتخاب زبان",
        "lang_note": "توجه: عنوان‌ها و توضیحات در صورت وجود به‌صورت خودکار ترجمه می‌شوند. برخی عنوان‌ها ممکن است به زبان اصلی باقی بمانند.",
        "cast": "بازیگران:",
        "watch_now": "▶ همین حالا تماشا کنید",
        "download_appname": "AllFLix اندروید",
        "download_badge": "به‌زودی",
        "download_text": "فیلم‌ها، قسمت‌های سریال، انیمه و درام‌های کامل را در اپلیکیشن رسمی AllFlix تماشا کنید.",
        "notify_me": "به من اطلاع بده",
        "notify_me_done": "به شما اطلاع داده خواهد شد!",
        "section_trending": "پرطرفدار امروز",
        "section_movies": "فیلم‌های محبوب",
        "section_tv": "سریال‌ها و انیمه‌های محبوب",
        "brand": "آل‌فلیکس",
        "footer_about": "درباره",
        "footer_benefits": "مزایا",
        "footer_support": "پشتیبانی",
        "footer_copy": "© 2026 AllFlix. تمامی حقوق محفوظ است.",
        "no_results": "نتیجه‌ای یافت نشد.",
        "results_for": "نتایج برای",
        "no_overview": "خلاصه‌ای برای این عنوان موجود نیست.",
        "unknown_cast": "بازیگران نامشخص",
        "no_stream": "هنوز پیوند پخش یا تریلری برای این عنوان موجود نیست."
    },
    "pa": {
        "nav_trending": "ਟ੍ਰੈਂਡਿੰਗ",
        "nav_movies": "ਫਿਲਮਾਂ",
        "nav_tv": "ਟੀਵੀ ਸ਼ੋਅ ਅਤੇ ਐਨੀਮੇ",
        "search_placeholder": "ਫਿਲਮਾਂ, ਐਨੀਮੇ ਜਾਂ ਡਰਾਮਾ ਖੋਜੋ...",
        "home": "ਹੋਮ",
        "language": "ਭਾਸ਼ਾ",
        "mode": "ਮੋਡ",
        "download": "ਡਾਊਨਲੋਡ",
        "about_us": "ਸਾਡੇ ਬਾਰੇ",
        "select_language": "ਭਾਸ਼ਾ ਚੁਣੋ",
        "lang_note": "ਨੋਟ: ਸਿਰਲੇਖ ਅਤੇ ਵੇਰਵੇ ਉਪਲਬਧ ਹੋਣ 'ਤੇ ਆਪਣੇ ਆਪ ਅਨੁਵਾਦ ਹੋ ਜਾਂਦੇ ਹਨ। ਕੁਝ ਸਿਰਲੇਖ ਮੂਲ ਭਾਸ਼ਾ ਵਿੱਚ ਰਹਿ ਸਕਦੇ ਹਨ।",
        "cast": "ਕਲਾਕਾਰ:",
        "watch_now": "▶ ਹੁਣੇ ਦੇਖੋ",
        "download_appname": "AllFLix ਐਂਡਰਾਇਡ",
        "download_badge": "ਜਲਦੀ ਆ ਰਿਹਾ ਹੈ",
        "download_text": "ਅਧਿਕਾਰਤ AllFlix ਐਪ 'ਤੇ ਪੂਰੀਆਂ ਫਿਲਮਾਂ, ਟੀਵੀ ਐਪੀਸੋਡ, ਐਨੀਮੇ ਅਤੇ ਡਰਾਮੇ ਦੇਖੋ।",
        "notify_me": "ਮੈਨੂੰ ਸੂਚਿਤ ਕਰੋ",
        "notify_me_done": "ਤੁਹਾਨੂੰ ਸੂਚਿਤ ਕੀਤਾ ਜਾਵੇਗਾ!",
        "section_trending": "ਅੱਜ ਟ੍ਰੈਂਡਿੰਗ",
        "section_movies": "ਪ੍ਰਸਿੱਧ ਫਿਲਮਾਂ",
        "section_tv": "ਪ੍ਰਸਿੱਧ ਟੀਵੀ ਸ਼ੋਅ ਅਤੇ ਐਨੀਮੇ",
        "brand": "ਆਲ ਫਲਿਕਸ",
        "footer_about": "ਜਾਣ-ਪਛਾਣ",
        "footer_benefits": "ਲਾਭ",
        "footer_support": "ਸਹਾਇਤਾ",
        "footer_copy": "© 2026 AllFlix. ਸਾਰੇ ਅਧਿਕਾਰ ਸੁਰੱਖਿਅਤ ਹਨ।",
        "no_results": "ਕੋਈ ਨਤੀਜਾ ਨਹੀਂ ਮਿਲਿਆ।",
        "results_for": "ਲਈ ਨਤੀਜੇ",
        "no_overview": "ਇਸ ਸਿਰਲੇਖ ਲਈ ਕੋਈ ਸੰਖੇਪ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।",
        "unknown_cast": "ਅਣਪਛਾਤੇ ਕਲਾਕਾਰ",
        "no_stream": "ਇਸ ਸਿਰਲੇਖ ਲਈ ਹਾਲੇ ਕੋਈ ਸਟ੍ਰੀਮਿੰਗ ਲਿੰਕ ਜਾਂ ਟ੍ਰੇਲਰ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।"
    },
    "ta": {
        "nav_trending": "டிரெண்டிங்",
        "nav_movies": "திரைப்படங்கள்",
        "nav_tv": "டிவி நிகழ்ச்சிகள் & அனிமே",
        "search_placeholder": "திரைப்படங்கள், அனிமே அல்லது நாடகங்களைத் தேடுங்கள்...",
        "home": "முகப்பு",
        "language": "மொழி",
        "mode": "பயன்முறை",
        "download": "பதிவிறக்கம்",
        "about_us": "எங்களைப் பற்றி",
        "select_language": "மொழியைத் தேர்ந்தெடு",
        "lang_note": "குறிப்பு: தலைப்புகளும் விளக்கங்களும் கிடைக்கும்போது தானாக மொழிபெயர்க்கப்படும். சில தலைப்புகள் மூல மொழியில் இருக்கலாம்.",
        "cast": "நடிகர்கள்:",
        "watch_now": "▶ இப்போது பார்க்கவும்",
        "download_appname": "AllFLix ஆண்ட்ராய்டு",
        "download_badge": "விரைவில்",
        "download_text": "அதிகாரப்பூர்வ AllFlix ஆப்பில் முழு திரைப்படங்கள், டிவி எபிசோடுகள், அனிமே மற்றும் நாடகங்களைப் பாருங்கள்.",
        "notify_me": "எனக்கு அறிவிக்கவும்",
        "notify_me_done": "உங்களுக்கு அறிவிக்கப்படும்!",
        "section_trending": "இன்று டிரெண்டிங்",
        "section_movies": "பிரபலமான திரைப்படங்கள்",
        "section_tv": "பிரபலமான டிவி & அனிமே",
        "brand": "ஆல்ஃபிளிக்ஸ்",
        "footer_about": "எங்களைப் பற்றி",
        "footer_benefits": "நன்மைகள்",
        "footer_support": "ஆதரவு",
        "footer_copy": "© 2026 AllFlix. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.",
        "no_results": "முடிவுகள் இல்லை.",
        "results_for": "இதற்கான முடிவுகள்",
        "no_overview": "இந்த தலைப்பிற்கு சுருக்கம் இல்லை.",
        "unknown_cast": "நடிகர்கள் தெரியவில்லை",
        "no_stream": "இந்த தலைப்பிற்கு இன்னும் ஸ்ட்ரீமிங் இணைப்பு அல்லது ட்ரெய்லர் இல்லை."
    },
    "my": {
        "nav_trending": "ခေတ်စား",
        "nav_movies": "ရုပ်ရှင်များ",
        "nav_tv": "တီဗွီနှင့် အနိမေးရှင်း",
        "search_placeholder": "ရုပ်ရှင်၊ အနိမေးရှင်း သို့မဟုတ် ဒရာမာ ရှာဖွေပါ...",
        "home": "ပင်မ",
        "language": "ဘာသာစကား",
        "mode": "မုဒ်",
        "download": "ဒေါင်းလုဒ်",
        "about_us": "ကျွန်ုပ်တို့အကြောင်း",
        "select_language": "ဘာသာစကားရွေးပါ",
        "lang_note": "မှတ်ချက်: ခေါင်းစဉ်နှင့် အကျဉ်းချုပ်များကို ရရှိနိုင်ပါက အလိုအလျောက် ဘာသာပြန်ပါမည်။ အချို့ခေါင်းစဉ်များသည် မူရင်းဘာသာစကားဖြင့် ကျန်ရှိနိုင်သည်။",
        "cast": "သရုပ်ဆောင်များ:",
        "watch_now": "▶ ယခုကြည့်ရန်",
        "download_appname": "AllFLix အန်းဒရွိုက်",
        "download_badge": "မကြာမီရောက်ရှိမည်",
        "download_text": "တရားဝင် AllFlix အက်ပ်တွင် ရုပ်ရှင်များ၊ တီဗွီအပိုင်းများ၊ အနိမေးရှင်းနှင့် ဒရာမာများကို အပြည့်အစုံ ကြည့်ရှုပါ။",
        "notify_me": "ကျွန်ုပ်ကို အသိပေးပါ",
        "notify_me_done": "သင့်ကို အသိပေးပါမည်!",
        "section_trending": "ယနေ့ ခေတ်စားနေသော",
        "section_movies": "ရေပန်းစားသော ရုပ်ရှင်များ",
        "section_tv": "ရေပန်းစားသော တီဗွီနှင့် အနိမေးရှင်း",
        "brand": "အောလ်ဖလစ်",
        "footer_about": "အကြောင်း",
        "footer_benefits": "အကျိုးကျေးဇူး",
        "footer_support": "ပံ့ပိုးမှု",
        "footer_copy": "© 2026 AllFlix. မူပိုင်ခွင့်အားလုံး ထိန်းသိမ်းထားသည်။",
        "no_results": "ရလဒ်များ မတွေ့ပါ။",
        "results_for": "ရလဒ်များ",
        "no_overview": "ဤခေါင်းစဉ်အတွက် အကျဉ်းချုပ် မရှိပါ။",
        "unknown_cast": "သရုပ်ဆောင်များ မသိရပါ",
        "no_stream": "ဤခေါင်းစဉ်အတွက် streaming link သို့မဟုတ် trailer မရှိသေးပါ။"
    },
    "km": {
        "nav_trending": "កំពុងពេញនិយម",
        "nav_movies": "ភាពយន្ត",
        "nav_tv": "រឿងទូរទស្សន៍ និងអានីម៉េ",
        "search_placeholder": "ស្វែងរកភាពយន្ត អានីម៉េ ឬរឿងភាគ...",
        "home": "ទំព័រដើម",
        "language": "ភាសា",
        "mode": "របៀប",
        "download": "ទាញយក",
        "about_us": "អំពីយើង",
        "select_language": "ជ្រើសរើសភាសា",
        "lang_note": "ចំណាំ៖ ចំណងជើង និងសេចក្ដីពិពណ៌នាត្រូវបានបកប្រែដោយស្វ័យប្រវត្តិនៅពេលមាន។ ចំណងជើងខ្លះអាចនៅតែជាភាសាដើម។",
        "cast": "តួសំដែង៖",
        "watch_now": "▶ មើលឥឡូវនេះ",
        "download_appname": "AllFLix សម្រាប់ Android",
        "download_badge": "មកដល់ឆាប់ៗនេះ",
        "download_text": "មើលភាពយន្ត វគ្គទូរទស្សន៍ អានីម៉េ និងរឿងភាគពេញនៅលើកម្មវិធី AllFlix ផ្លូវការ។",
        "notify_me": "ជូនដំណឹងខ្ញុំ",
        "notify_me_done": "អ្នកនឹងត្រូវបានជូនដំណឹង!",
        "section_trending": "កំពុងពេញនិយមថ្ងៃនេះ",
        "section_movies": "ភាពយន្តពេញនិយម",
        "section_tv": "រឿងទូរទស្សន៍ និងអានីម៉េពេញនិយម",
        "brand": "អលហ្វ្លិច",
        "footer_about": "អំពី",
        "footer_benefits": "អត្ថប្រយោជន៍",
        "footer_support": "ជំនួយ",
        "footer_copy": "© 2026 AllFlix. រក្សាសិទ្ធិគ្រប់យ៉ាង។",
        "no_results": "រកមិនឃើញលទ្ធផលទេ។",
        "results_for": "លទ្ធផលសម្រាប់",
        "no_overview": "មិនមានសេចក្ដីសង្ខេបសម្រាប់ចំណងជើងនេះទេ។",
        "unknown_cast": "មិនស្គាល់តួសំដែង",
        "no_stream": "មិនទាន់មានតំណភ្ជាប់ស្ទ្រីម ឬ trailer សម្រាប់ចំណងជើងនេះទេ។"
    }
};

// ===================== DARK / LIGHT MODE =====================
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

// Tinatawag pag-load ng page para i-apply ang naka-save na mode (kung meron), bago pa man mag-render.
function applyModeOnLoad() {
    if (currentMode === "light") {
        document.body.classList.add("light-mode");
    } else {
        document.body.classList.remove("light-mode");
    }
    const icon = document.getElementById("mode-icon");
    if (icon) icon.innerHTML = currentMode === "light" ? SUN_SVG : MOON_SVG;
}

function toggleMode() {
    const body = document.body;
    const icon = document.getElementById("mode-icon");
    body.classList.toggle("light-mode");

    currentMode = body.classList.contains("light-mode") ? "light" : "dark";
    localStorage.setItem(MODE_STORAGE_KEY, currentMode);

    icon.innerHTML = currentMode === "light" ? SUN_SVG : MOON_SVG;
}

// ===================== DOWNLOAD (COMING SOON) =====================
const PLATFORM_DATA = [
    { id: "android",   icon: "📱", label: "Android",    date: "20260831" },
    { id: "windows",   icon: "🖥️", label: "Windows",    date: "20260930" },
    { id: "androidtv", icon: "📺", label: "Android TV", date: "20261031" },
    { id: "ios",       icon: "🍏", label: "iOS",        date: "20261130" },
    { id: "linux",     icon: "🐧", label: "Linux",      date: "20261231" },
    { id: "macos",     icon: "💻", label: "macOS",      date: "20270228" }
];

function buildDownloadCards() {
    const list = document.getElementById("download-list");
    if (!list) return;

    list.innerHTML = PLATFORM_DATA.map(p => `
            <div class="download-card">
                <div class="download-card-header">
                    <div class="download-card-title">
                        <span class="download-app-icon">${p.icon}</span>
                        <span>${p.label}</span>
                    </div>
                    <span class="download-badge">${t("download_badge")}</span>
                </div>
                <p class="download-card-desc">${t("download_text")}</p>
                <button class="btn-notify" id="btn-notify-${p.id}" onclick="notifyMe('${p.id}')">
                    <span class="notify-icon">🔔</span> <span>${t("notify_me")}</span>
                </button>
                <a class="notify-fallback" id="fallback-${p.id}"></a>
            </div>
    `).join("");
}

function showDownload() {
    closeSidePanel();
    buildDownloadCards();
    document.getElementById("downloadModal").style.display = "flex";
    document.body.style.overflow = "hidden"; // iwas double scrollbar sa likod ng modal
}

function closeDownload() {
    document.getElementById("downloadModal").style.display = "none";
    document.body.style.overflow = "";
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function icsNextDay(yyyymmdd) {
    const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return dt.getUTCFullYear() + pad2(dt.getUTCMonth() + 1) + pad2(dt.getUTCDate());
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildIcsFile(appName, date, endDate) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const uid = "allflix-" + date + "-" + Math.random().toString(36).slice(2) + "@allflix";
    const details = `${appName} launches today.`;
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AllFLix//Coming Soon//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        "UID:" + uid,
        "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + date,
        "DTEND;VALUE=DATE:" + endDate,
        "SUMMARY:" + appName + " launches!",
        "DESCRIPTION:" + details,
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n");
}

// Notify Me button sa bawat platform card
function notifyMe(platformId) {
    const platform = PLATFORM_DATA.find(p => p.id === platformId);
    if (!platform) return;

    const btn = document.getElementById(`btn-notify-${platformId}`);
    const appName = platform.label;
    const endDate = icsNextDay(platform.date);
    const icsContent = buildIcsFile(appName, platform.date, endDate);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const fileName = appName.replace(/\s+/g, "-").toLowerCase() + ".ics";

    if (isMobileDevice()) {
        // Sa cellphone, direktang binubukas ang .ics para awtomatikong makuha ng native Calendar app.
        window.location.href = blobUrl;

        // Safety net: kung walang calendar app na naka-associate sa .ics (hal. tinanggal sa iOS),
        // maglalabas ng manual download link pagkatapos ng ilang segundo.
        const fallback = document.getElementById(`fallback-${platformId}`);
        if (fallback) {
            fallback.href = blobUrl;
            fallback.download = fileName;
            fallback.style.display = "none";
            clearTimeout(fallback._showTimer);
            fallback._showTimer = setTimeout(() => {
                fallback.textContent = "Didn't open? Tap to download instead";
                fallback.style.display = "block";
            }, 1800);
        }
    } else {
        // Sa desktop/laptop, direktang mag-do-download para ma-open sa kanilang calendar app.
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="notify-icon">✅</span> <span>${t("notify_me_done")}</span>`;
    }
}

// ===================== ABOUT US =====================
// Nilalaman ng About Us bilang structured data (hindi na plain HTML string) para ma-auto-translate
// ito gamit ang parehong MyMemory translation pipeline na ginagamit sa movie/TV titles at descriptions.
// label = bold na maikling parirala bago ang dash (hal. "Movies —"), text = ang buong pangungusap.
const aboutUsData = [
    { type: "h2", anchor: "about-section-about", text: "Welcome to AllFlix" },
    { type: "p", text: "Welcome to AllFlix, your ultimate destination for discovering the world of entertainment through trailers, teasers, promotional videos, and the latest previews from across the globe." },
    { type: "p", text: "At AllFlix, we are dedicated to collecting and showcasing a wide range of official trailers that allow fans to stay informed about upcoming releases while rediscovering beloved classics." },

    { type: "h2", text: "Our Story" },
    { type: "p", text: "The idea behind AllFlix was born from a simple observation: entertainment fans often have to visit multiple websites and platforms just to keep up with the latest trailers. We envisioned a single destination where everyone could discover the latest trailers regardless of where they originated." },

    { type: "h2", text: "Our Mission" },
    { type: "p", text: "Our mission is to become one of the world's most trusted destinations for discovering official entertainment trailers, making entertainment discovery simple, organized, and enjoyable for everyone." },

    { type: "h2", text: "Our Vision" },
    { type: "p", text: "Our vision is to build a global entertainment community where people from different countries can discover stories beyond borders, regardless of where they live or what language they speak." },

    { type: "h2", text: "What You'll Find on Our Website" },
    { type: "p", label: "Movies", text: "Official trailers for Hollywood blockbusters, independent films, and international cinema." },
    { type: "p", label: "Korean Dramas (K-Dramas)", text: "The newest Korean dramas across every genre." },
    { type: "p", label: "Japanese Dramas (J-Dramas)", text: "Previews spanning romance, suspense, comedy, and more." },
    { type: "p", label: "Chinese Dramas (C-Dramas)", text: "Historical epics, wuxia, modern romance, and thrillers." },
    { type: "p", label: "Anime", text: "TV anime, films, and original animations across every genre." },
    { type: "p", label: "Cartoons & Animated Films", text: "Family-friendly and internationally recognized animated productions." },

    { type: "h2", anchor: "about-section-benefits", text: "Benefits" },
    { type: "p", label: "Truly Global", text: "Every region, one site: Filipino, K-Drama, Turkish, European, Latin, Middle Eastern, African, anime, and more." },
    { type: "p", label: "Always Up To Date", text: "New previews added as they release." },
    { type: "p", label: "Organized Browsing", text: "Clear categories, less searching." },
    { type: "p", label: "No Language Barriers", text: "Discover storytelling beyond your own culture." },
    { type: "p", label: "Free to Browse", text: "No account required." },
    { type: "p", label: "Built for Fans", text: "Fast, clean, mobile-friendly." },

    { type: "h2", text: "Copyright & Disclaimer" },
    { type: "p", text: "All trailers, promotional videos, posters, logos, trademarks, titles, character names, and related media displayed on AllFlix remain the property of their respective copyright owners. Our website does not claim ownership of any copyrighted promotional material unless explicitly stated. All media is presented solely for informational, promotional, educational, commentary, and entertainment purposes." },
    { type: "p", text: "If you are a copyright owner or authorized representative and believe material on our website should be removed or updated, please contact us. We are committed to responding promptly and addressing legitimate concerns." },

    { type: "h2", anchor: "about-section-support", text: "Support" },
    { type: "p", text: "Questions, partnership ideas, or a copyright concern — we're listening." },
    { type: "p", label: "General / Copyright:", text: "idamgo549@gmail.com", skipTranslate: true },
    { type: "p", label: "Response time:", text: "Within 3–5 business days." },
    { type: "p", label: "Is AllFlix free to use?", text: "Yes, no account is required." },
    { type: "p", label: "Do you host full movies or episodes?", text: "No — trailers only, official previews sourced from studios worldwide." },
    { type: "p", label: "Can I suggest a title?", text: "Yes — just send the title, country of origin, and source of the official trailer to idamgo549@gmail.com." },

    { type: "h2", text: "Thank You" },
    { type: "p", text: "One Website. Thousands of Stories. Endless Entertainment." }
];

// I-render ang About Us: agad na ipapakita ang English na bersyon (para mabilis ang open ng modal),
// pagkatapos, kung ang kasalukuyang wika ay hindi English, i-auto-translate ang bawat block gamit
// ang parehong queue/cache na ginagamit sa mga pamagat ng pelikula — lalabas ang salin paisa-isa.
function renderAboutUs() {
    const container = document.getElementById("about-body-content");
    let html = "";

    aboutUsData.forEach((item, idx) => {
        const blockId = `about-block-${idx}`;
        if (item.type === "h2") {
            const idAttr = item.anchor ? ` id="${item.anchor}"` : "";
            html += `<h2${idAttr} data-about-id="${blockId}">${item.text}</h2>`;
        } else {
            const body = item.label ? `<strong>${item.label}</strong> — ${item.text}` : item.text;
            html += `<p data-about-id="${blockId}">${body}</p>`;
        }
    });

    container.innerHTML = html;

    if (currentLanguage === "en") return;

    aboutUsData.forEach((item, idx) => {
        if (item.skipTranslate) return; // hal. email address — walang kailangang i-translate
        const blockId = `about-block-${idx}`;

        queueTranslate(item.text, "en", currentLanguage, (translatedText) => {
            const el = container.querySelector(`[data-about-id="${blockId}"]`);
            if (!el) return;

            if (item.label) {
                queueTranslate(item.label, "en", currentLanguage, (translatedLabel) => {
                    const el2 = container.querySelector(`[data-about-id="${blockId}"]`);
                    if (el2) el2.innerHTML = `<strong>${translatedLabel}</strong> — ${translatedText}`;
                });
            } else {
                el.innerText = translatedText;
            }
        });
    });
}

// section: "about" | "benefits" | "support" (opsyonal) — pag binigay, direkta doon mag-a-scroll
function showAboutUs(section) {
    closeSidePanel();
    renderAboutUs();
    document.getElementById("aboutModal").style.display = "block";

    if (section) {
        setTimeout(() => {
            const target = document.getElementById("about-section-" + section);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
    } else {
        document.getElementById("about-body-content").scrollTop = 0;
    }
}

function closeAboutUs() {
    document.getElementById("aboutModal").style.display = "none";
}
