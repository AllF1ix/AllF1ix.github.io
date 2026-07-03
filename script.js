const BASE_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";

// 🔐 ANG IYONG LIVE ACCESS TOKEN MULA SA TMDB
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3NGNiYzA3NTJlMGEzNmZkYWM2NjU3YmIyMDZmMGJlYyIsIm5iZiI6MTc4Mjk0Nzk2NS43MTEsInN1YiI6IjZhNDVhMDdkZWI1NWZjYzQ2YjQ5ZTM5MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ilS0nk-zuZzmHq75FG6rk-1y-bcua8J6aAUC-ddcnvc";

// 🍿 DITO MO ILALAGAY ANG MGA SARILI MONG STREAMING LINKS BASI SA TMDB ID
const akingMgaStreamingLinks = {
    "23156": "https://iyong-server.com", // Halimbawa (ID ng Naruto)
    "550": "https://iyong-server.com"
};

// Ilang items lang ipapakita sa grid (2 rows x 6 columns = 12)
const MAX_GRID_ITEMS = 12;

// Para sa Movies / TV Shows & Anime catalog: 50 pages x 20 items = 1000 items
const CATALOG_PAGES = 50;
const MAX_CATALOG_ITEMS = 1000;

let currentSelectedShow = { id: "", type: "", youtubeKey: "" };
let currentCategory = "trending";

// Pag-load sa simula ng Trending
window.onload = function() {
    loadTrending();
};

function loadTrending() {
    currentCategory = "trending";
    const url = `${BASE_URL}/trending/all/day`;
    document.getElementById("section-title").innerText = t("section_trending");

    // I-reset ang active button state papuntang Trending
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const trendingBtn = document.querySelector(".nav-btn");
    if (trendingBtn) trendingBtn.classList.add("active");

    // Ipakita ulit ang Spotlight banner
    document.getElementById("hero-banner").style.display = "flex";
    document.body.classList.remove("no-hero");

    fetchData(url, (data) => {
        if (data && data.results && data.results.length > 0) {
            renderGrid(data.results);
            const firstItem = data.results[0];
            const type = firstItem.media_type || (firstItem.first_air_date ? 'tv' : 'movie');
            fetchFullDetails(firstItem.id, type);
        }
    });
}

// Secured Fetcher gamit ang Authorization Headers (Anti-CORS Block)
function fetchData(url, callback) {
    fetch(url, {
        method: 'GET',
        headers: {
            accept: 'application/json',
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

// Pag-render ng mga Card sa Screen
// limit: ilang items ipapakita | showNumbers: numbering box (Trending lang)
function renderGrid(items, limit = MAX_GRID_ITEMS, showNumbers = true) {
    const grid = document.getElementById("media-grid-items");

    const limitedItems = items.filter(item => item.poster_path).slice(0, limit);

    // Ginawang isang beses lang ang innerHTML update (mas mabilis kaysa sa paulit-ulit na += sa loob ng loop, lalo na pag daan-daan/libong items)
    const htmlParts = limitedItems.map((item, index) => {
        const title = item.title || item.name;
        const safeTitle = title ? title.replace(/"/g, "&quot;") : "";
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const number = index + 1;

        return `
            <div class="card" onclick="fetchFullDetails('${item.id}', '${type}', true)">
                ${showNumbers ? `<span class="card-number">${number}</span>` : ""}
                <img src="${IMG_URL + item.poster_path}" alt="${safeTitle}" loading="lazy">
                <div class="card-details">
                    <div class="card-title">${title}</div>
                </div>
            </div>
        `;
    });

    grid.innerHTML = htmlParts.join("");
}

// Paglipat ng Menu Tabs (Trending, Movies, TV/Anime)
function changeCategory(type) {
    const buttons = document.querySelectorAll(".nav-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");

    currentCategory = type;
    document.getElementById("section-title").innerText = t("section_trending");

    const heroBanner = document.getElementById("hero-banner");

    if (type === 'movie') {
        document.getElementById("section-title").innerText = t("section_movies");
        heroBanner.style.display = "none";
        document.body.classList.add("no-hero");
        fetchManyPages(`${BASE_URL}/discover/movie?sort_by=popularity.desc`, CATALOG_PAGES, (results) => {
            renderGrid(results, MAX_CATALOG_ITEMS, false);
        });
    } else if (type === 'tv') {
        document.getElementById("section-title").innerText = t("section_tv");
        heroBanner.style.display = "none";
        document.body.classList.add("no-hero");
        fetchManyPages(`${BASE_URL}/discover/tv?sort_by=popularity.desc`, CATALOG_PAGES, (results) => {
            renderGrid(results, MAX_CATALOG_ITEMS, false);
        });
    } else {
        // Trending: ipakita ulit ang Spotlight banner, 12 items lang may numbering
        heroBanner.style.display = "flex";
        document.body.classList.remove("no-hero");
        fetchData(`${BASE_URL}/trending/all/day`, (data) => {
            if (data && data.results) renderGrid(data.results, MAX_GRID_ITEMS, true);
        });
    }
}

// Kumuha ng ilang pages (para sa maraming resulta sa Movies / TV Shows & Anime)
function fetchManyPages(baseUrl, totalPages, callback) {
    const pageRequests = [];
    for (let page = 1; page <= totalPages; page++) {
        const separator = baseUrl.includes("?") ? "&" : "?";
        pageRequests.push(
            fetch(`${baseUrl}${separator}page=${page}`, {
                method: 'GET',
                headers: { accept: 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` }
            }).then(res => res.ok ? res.json() : { results: [] }).catch(() => ({ results: [] }))
        );
    }
    Promise.all(pageRequests).then(pages => {
        const combined = pages.flatMap(p => p.results || []);
        callback(combined);
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

    // Debounce para hindi sobrang dami ng request habang nagta-type
    searchDebounceTimer = setTimeout(() => {
        fetchSuggestions(query);
    }, 350);
}

function fetchSuggestions(query) {
    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}`;
    fetchData(url, (data) => {
        const results = (data && data.results) ? data.results.filter(r => (r.title || r.name) && (r.media_type === 'movie' || r.media_type === 'tv')) : [];
        renderSuggestions(results.slice(0, 8));
    });
}

function renderSuggestions(results) {
    const list = document.getElementById("search-suggestions");
    list.innerHTML = "";

    if (results.length === 0) {
        list.innerHTML = `<li class="sugg-empty">Walang nahanap na resulta.</li>`;
        list.classList.add("open");
        return;
    }

    results.forEach(item => {
        const title = item.title || item.name;
        const type = item.media_type;
        const year = (item.release_date || item.first_air_date || "").slice(0, 4);
        const poster = item.poster_path ? (IMG_URL + item.poster_path) : "";

        const li = document.createElement("li");
        li.innerHTML = `
            ${poster ? `<img src="${poster}" alt="${title}">` : `<div class="sugg-info" style="width:36px;height:52px;"></div>`}
            <div class="sugg-info">
                <span class="sugg-title">${title}</span>
                <span class="sugg-meta">${type === 'tv' ? 'TV Show' : 'Movie'}${year ? ' • ' + year : ''}</span>
            </div>
        `;
        li.onclick = () => selectSuggestion(item.id, type, title);
        list.appendChild(li);
    });

    list.classList.add("open");
}

function selectSuggestion(id, type, title) {
    document.getElementById("search-input").value = title;
    closeSuggestions();
    document.getElementById("section-title").innerText = `Resulta para sa: "${title}"`;
    fetchFullDetails(id, type, true);
}

function closeSuggestions() {
    const list = document.getElementById("search-suggestions");
    list.classList.remove("open");
    list.innerHTML = "";
}

// Isara ang dropdown kapag nag-click sa labas nito
document.addEventListener("click", function(event) {
    const wrapper = document.querySelector(".search-box-wrapper");
    if (wrapper && !wrapper.contains(event.target)) {
        closeSuggestions();
    }
});

function triggerSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}`;
    document.getElementById("section-title").innerText = `Resulta para sa: "${query}"`;

    fetchData(url, (data) => {
        if (data && data.results && data.results.length > 0) {
            renderGrid(data.results, data.results.length, false);
            const firstItem = data.results[0];
            const type = firstItem.media_type || (firstItem.first_air_date ? 'tv' : 'movie');
            fetchFullDetails(firstItem.id, type);
        }
    });
}

// Pagkuha ng Kumpletong Detalye (Cast at Video Backup)
// autoplay = true: awtomatikong bubukas ang trailer/streaming player pagkatapos ma-load ang detalye (para sa pag-click sa mga card)
function fetchFullDetails(id, type, autoplay = false) {
    const detailsUrl = `${BASE_URL}/${type}/${id}?append_to_response=credits,videos`;
    fetchData(detailsUrl, (data) => {
        updateSpotlight(data, type);
        if (autoplay) openPlayer();
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Pag-update sa Spotlight Banner sa taas
function updateSpotlight(data, type) {
    if (!data) return;
    const title = data.title || data.name;
    document.getElementById("banner-title").innerText = title;
    document.getElementById("banner-desc").innerText = data.overview || "Walang nakikitang buod para sa palabas na ito.";
    document.getElementById("banner-tag").innerText = type.toUpperCase();

    // Set Background Image
    if (data.backdrop_path) {
        document.getElementById("hero-banner").style.backgroundImage = `linear-gradient(to top, #0c0c0c 10%, rgba(12,12,12,0.4) 50%, rgba(12,12,12,0.8) 100%), url('${BACKDROP_URL + data.backdrop_path}')`;
    }

    // Cast details
    if (data.credits && data.credits.cast && data.credits.cast.length > 0) {
        const actors = data.credits.cast.slice(0, 3).map(a => a.name).join(", ");
        document.getElementById("banner-cast").innerText = actors;
    } else {
        document.getElementById("banner-cast").innerText = "Unknown Cast";
    }

    currentSelectedShow.id = data.id.toString();
    currentSelectedShow.type = type;

    let ytKey = "";
    if (data.videos && data.videos.results) {
        const trailer = data.videos.results.find(v => v.type === "Trailer" && v.site === "YouTube");
        if (trailer) ytKey = trailer.key;
    }
    currentSelectedShow.youtubeKey = ytKey;
}

// VIDEO PLAYER LOGIC
function openPlayer() {
    const modal = document.getElementById("videoModal");
    const container = document.getElementById("player-container");
    const showId = currentSelectedShow.id;

    if (akingMgaStreamingLinks[showId]) {
        const akingLink = akingMgaStreamingLinks[showId];
        if (akingLink.endsWith(".mp4") || akingLink.includes("video")) {
            container.innerHTML = `
                <video controls autoplay>
                    <source src="${akingLink}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>`;
        } else {
            container.innerHTML = `<iframe src="${akingLink}" frameborder="0" allowfullscreen></iframe>`;
        }
    } else if (currentSelectedShow.youtubeKey) {
        container.innerHTML = `<iframe src="https://www.youtube.com/embed/${currentSelectedShow.youtubeKey}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
    } else {
        container.innerHTML = `<div style="text-align:center; padding: 50px; font-weight:bold; color:red;">Wala pang streaming link o trailer para rito.</div>`;
    }

    modal.style.display = "block";
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

// HOME: babalik sa Trending / nagre-refresh ng content
function goHome() {
    closeSidePanel();
    loadTrending();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===================== LANGUAGE PANEL =====================
let currentLanguage = "en";

const translations = {
    en: {
        nav_trending: "Trending", nav_movies: "Movies", nav_tv: "TV Shows & Anime",
        search_placeholder: "Search for Movies, Anime, or Drama...",
        home: "Home", language: "Language", mode: "Mode", download: "Download", about_us: "About Us",
        select_language: "Select Language",
        lang_note: "Note: Movie/show titles and descriptions come from TMDB and will stay in their original language.",
        cast: "Cast:", watch_now: "▶ Watch Now",
        download_title: "Coming Soon", download_text: "The Download feature is coming soon. Stay tuned!",
        section_trending: "Trending Today", section_movies: "Popular Movies", section_tv: "Popular TV Shows & Anime"
    },
    tl: {
        nav_trending: "Trending", nav_movies: "Mga Pelikula", nav_tv: "TV Shows & Anime",
        search_placeholder: "Maghanap ng Pelikula, Anime, o Drama...",
        home: "Home", language: "Wika", mode: "Mode", download: "I-download", about_us: "Tungkol Sa Amin",
        select_language: "Pumili ng Wika",
        lang_note: "Paalala: Ang mga pamagat/buod ng palabas ay galing sa TMDB at mananatili sa orihinal na wika.",
        cast: "Mga Aktor:", watch_now: "▶ Panoorin Na",
        download_title: "Malapit Na", download_text: "Ang Download feature ay malapit na. Manatiling nakatutok!",
        section_trending: "Trending Ngayon", section_movies: "Sikat na mga Pelikula", section_tv: "Sikat na TV Shows & Anime"
    },
    ja: {
        nav_trending: "トレンド", nav_movies: "映画", nav_tv: "テレビ番組とアニメ",
        search_placeholder: "映画、アニメ、ドラマを検索...",
        home: "ホーム", language: "言語", mode: "モード", download: "ダウンロード", about_us: "私たちについて",
        select_language: "言語を選択",
        lang_note: "注：タイトルと説明はTMDBのデータで、元の言語のまま表示されます。",
        cast: "出演者：", watch_now: "▶ 今すぐ見る",
        download_title: "近日公開", download_text: "ダウンロード機能は近日公開予定です。お楽しみに！",
        section_trending: "今日のトレンド", section_movies: "人気の映画", section_tv: "人気のテレビ番組とアニメ"
    },
    ko: {
        nav_trending: "트렌딩", nav_movies: "영화", nav_tv: "TV 프로그램 & 애니메이션",
        search_placeholder: "영화, 애니메이션, 드라마 검색...",
        home: "홈", language: "언어", mode: "모드", download: "다운로드", about_us: "회사 소개",
        select_language: "언어 선택",
        lang_note: "참고: 제목과 설명은 TMDB 데이터이며 원래 언어로 표시됩니다.",
        cast: "출연진:", watch_now: "▶ 지금 시청하기",
        download_title: "출시 예정", download_text: "다운로드 기능은 곧 제공될 예정입니다. 기대해주세요!",
        section_trending: "오늘의 트렌드", section_movies: "인기 영화", section_tv: "인기 TV 프로그램 & 애니메이션"
    },
    zh: {
        nav_trending: "热门", nav_movies: "电影", nav_tv: "电视剧和动漫",
        search_placeholder: "搜索电影、动漫或电视剧...",
        home: "首页", language: "语言", mode: "模式", download: "下载", about_us: "关于我们",
        select_language: "选择语言",
        lang_note: "注意：标题和简介数据来自TMDB，将保持原始语言显示。",
        cast: "演员：", watch_now: "▶ 立即观看",
        download_title: "即将推出", download_text: "下载功能即将推出，敬请期待！",
        section_trending: "今日热门", section_movies: "热门电影", section_tv: "热门电视剧和动漫"
    },
    es: {
        nav_trending: "Tendencias", nav_movies: "Películas", nav_tv: "Series y Anime",
        search_placeholder: "Buscar películas, anime o series...",
        home: "Inicio", language: "Idioma", mode: "Modo", download: "Descargar", about_us: "Sobre Nosotros",
        select_language: "Seleccionar Idioma",
        lang_note: "Nota: Los títulos y descripciones provienen de TMDB y permanecerán en su idioma original.",
        cast: "Reparto:", watch_now: "▶ Ver Ahora",
        download_title: "Próximamente", download_text: "La función de descarga estará disponible pronto. ¡Mantente atento!",
        section_trending: "Tendencias de Hoy", section_movies: "Películas Populares", section_tv: "Series y Anime Populares"
    },
    fr: {
        nav_trending: "Tendances", nav_movies: "Films", nav_tv: "Séries et Anime",
        search_placeholder: "Rechercher films, anime ou séries...",
        home: "Accueil", language: "Langue", mode: "Mode", download: "Télécharger", about_us: "À Propos",
        select_language: "Choisir la Langue",
        lang_note: "Remarque : Les titres et descriptions proviennent de TMDB et resteront dans leur langue d'origine.",
        cast: "Distribution :", watch_now: "▶ Regarder",
        download_title: "Bientôt Disponible", download_text: "La fonction de téléchargement arrive bientôt. Restez à l'écoute !",
        section_trending: "Tendances du Jour", section_movies: "Films Populaires", section_tv: "Séries et Anime Populaires"
    },
    id: {
        nav_trending: "Trending", nav_movies: "Film", nav_tv: "Acara TV & Anime",
        search_placeholder: "Cari Film, Anime, atau Drama...",
        home: "Beranda", language: "Bahasa", mode: "Mode", download: "Unduh", about_us: "Tentang Kami",
        select_language: "Pilih Bahasa",
        lang_note: "Catatan: Judul dan deskripsi berasal dari TMDB dan akan tetap dalam bahasa aslinya.",
        cast: "Pemeran:", watch_now: "▶ Tonton Sekarang",
        download_title: "Segera Hadir", download_text: "Fitur unduh akan segera hadir. Nantikan!",
        section_trending: "Trending Hari Ini", section_movies: "Film Populer", section_tv: "Acara TV & Anime Populer"
    }
};

function t(key) {
    const dict = translations[currentLanguage] || translations.en;
    return dict[key] || translations.en[key] || key;
}

function toggleLanguagePanel() {
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

    document.querySelectorAll("#lang-list li").forEach(li => li.classList.remove("selected"));
    event.target.classList.add("selected");

    applyLanguage();

    setTimeout(() => {
        closeLanguagePanel();
    }, 300);
}

// I-apply ang napiling wika sa lahat ng static na text sa site
function applyLanguage() {
    document.getElementById("nav-trending").innerText = t("nav_trending");
    document.getElementById("nav-movies").innerText = t("nav_movies");
    document.getElementById("nav-tv").innerText = t("nav_tv");
    document.getElementById("search-input").placeholder = t("search_placeholder");

    document.getElementById("label-home").innerText = t("home");
    document.getElementById("label-language").innerText = t("language");
    document.getElementById("label-mode").innerText = t("mode");
    document.getElementById("label-download").innerText = t("download");
    document.getElementById("label-aboutus").innerText = t("about_us");

    document.getElementById("label-select-language").innerText = t("select_language");
    document.getElementById("lang-note").innerText = t("lang_note");

    document.getElementById("label-cast").innerText = t("cast");
    document.getElementById("label-watchnow").innerText = t("watch_now");

    document.getElementById("label-download-title").innerText = t("download_title");
    document.getElementById("label-download-text").innerText = t("download_text");

    // I-update ang section title base sa kasalukuyang tab
    const sectionTitle = document.getElementById("section-title");
    if (currentCategory === "movie") sectionTitle.innerText = t("section_movies");
    else if (currentCategory === "tv") sectionTitle.innerText = t("section_tv");
    else if (currentCategory === "trending") sectionTitle.innerText = t("section_trending");
}

// ===================== DARK / LIGHT MODE =====================
function toggleMode() {
    const body = document.body;
    const icon = document.getElementById("mode-icon");
    body.classList.toggle("light-mode");

    if (body.classList.contains("light-mode")) {
        icon.innerText = "☀️";
    } else {
        icon.innerText = "🌙";
    }
}

// ===================== DOWNLOAD (COMING SOON) =====================
function showDownload() {
    closeSidePanel();
    document.getElementById("downloadModal").style.display = "block";
}

function closeDownload() {
    document.getElementById("downloadModal").style.display = "none";
}

// ===================== ABOUT US =====================
function showAboutUs() {
    closeSidePanel();
    document.getElementById("about-body-content").innerHTML = aboutUsHTML;
    document.getElementById("aboutModal").style.display = "block";
}

function closeAboutUs() {
    document.getElementById("aboutModal").style.display = "none";
}

const aboutUsHTML = `
    <h2>Welcome to AllFlix</h2>
    <p>Welcome to AllFlix, your ultimate destination for discovering the world of entertainment through trailers, teasers, promotional videos, and the latest previews from across the globe.</p>
    <p>At AllFlix, we are dedicated to collecting and showcasing a wide range of official trailers that allow fans to stay informed about upcoming releases while rediscovering beloved classics.</p>

    <h2>Our Story</h2>
    <p>The idea behind AllFlix was born from a simple observation: entertainment fans often have to visit multiple websites and platforms just to keep up with the latest trailers. We envisioned a single destination where everyone could discover the latest trailers regardless of where they originated.</p>

    <h2>Our Mission</h2>
    <p>Our mission is to become one of the world's most trusted destinations for discovering official entertainment trailers, making entertainment discovery simple, organized, and enjoyable for everyone.</p>

    <h2>Our Vision</h2>
    <p>Our vision is to build a global entertainment community where people from different countries can discover stories beyond borders, regardless of where they live or what language they speak.</p>

    <h2>What You'll Find on Our Website</h2>
    <p><strong>Movies</strong> — Official trailers for Hollywood blockbusters, independent films, and international cinema.</p>
    <p><strong>Korean Dramas (K-Dramas)</strong> — The newest Korean dramas across every genre.</p>
    <p><strong>Japanese Dramas (J-Dramas)</strong> — Previews spanning romance, suspense, comedy, and more.</p>
    <p><strong>Chinese Dramas (C-Dramas)</strong> — Historical epics, wuxia, modern romance, and thrillers.</p>
    <p><strong>Anime</strong> — TV anime, films, and original animations across every genre.</p>
    <p><strong>Cartoons & Animated Films</strong> — Family-friendly and internationally recognized animated productions.</p>

    <h2>Copyright & Disclaimer</h2>
    <p>All trailers, promotional videos, posters, logos, trademarks, titles, character names, and related media displayed on AllFlix remain the property of their respective copyright owners. Our website does not claim ownership of any copyrighted promotional material unless explicitly stated. All media is presented solely for informational, promotional, educational, commentary, and entertainment purposes.</p>
    <p>If you are a copyright owner or authorized representative and believe material on our website should be removed or updated, please contact us. We are committed to responding promptly and addressing legitimate concerns.</p>

    <h2>Thank You</h2>
    <p>One Website. Thousands of Stories. Endless Entertainment.</p>
`;
