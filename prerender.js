/**
 * AllFlix — Static Pre-render Script
 * ==================================
 * Bakit ito kailangan:
 *   Ang mga /movie/{slug}-{id} at /tv/{slug}-{id} URLs ay client-side lang
 *   (JavaScript) ginagawa ng script.js — walang literal na file/folder para
 *   sa kanila sa repo. Kaya kapag direktang binisita ni Googlebot (o kahit
 *   sino) ang URL na 'yon, ang GitHub Pages mismo (bago pa marating ang
 *   index.html/script.js) ang nagbabalik ng tunay na HTTP 404 — kahit
 *   gumagana naman ang 404.html redirect trick mo para sa mga tao.
 *
 * Ano ang ginagawa ng script na ito:
 *   1. Binabasa ang sitemap.xml mo (kinukuha lahat ng /movie/ at /tv/ URLs).
 *   2. Para sa bawat isa, tinatawag ang parehong TMDB endpoint na ginagamit
 *      ng script.js (details + credits + videos, English) para makuha ang
 *      totoong titulo, overview, poster, cast.
 *   3. Ginagawang static HTML file ang bawat isa sa dist/movie/{slug}/index.html
 *      (o dist/tv/{slug}/index.html) — kopya ng index.html mo, pero:
 *        - Tama na ang <title>, meta description, canonical, OG/Twitter tags,
 *          at JSON-LD (parehong logic ng updateSEO() sa script.js).
 *        - May totoong laman na ang detail section (hindi na "Loading...")
 *          kaya makikita agad 'to ng Googlebot / link-preview bots kahit
 *          hindi pa tumatakbo ang JavaScript.
 *   4. Kapag na-load naman ng browser (may JS), tatakbo pa rin ang script.js
 *      gaya ng dati at ia-update lang uli ang parehong content — walang
 *      conflict, mas mabilis lang ang unang paint at 100% crawlable na.
 *
 *   [UPDATE] Ang JSON-LD schema (buildHead) ay pinalawak na ngayon para
 *   isama ang aggregateRating, genre, director, at trailer (VideoObject) —
 *   ito ang nagbibigay ng chance na lumabas ang star ratings/rich results
 *   sa Google Search. Walang extra API call na kailangan dahil galing lang
 *   ito sa parehong `data.credits` / `data.videos` na kinukuha na natin.
 *
 * PAANO GAMITIN:
 *   1. npm install node-fetch@2   (kung wala ka pang "fetch" sa Node version mo)
 *   2. Siguraduhing kasama sa parehong folder: index.html, sitemap.xml
 *   3. node prerender.js
 *   4. I-commit/i-push ang buong laman ng "dist/" folder (kasama ang mga
 *      existing files mo: style.css, script.js, og-default.jpg, atbp.)
 *
 *   Pwede rin itong i-automate via GitHub Actions (tumatakbo kada
 *   ma-update ang sitemap.xml mo) — sabihin mo lang kung gusto mo 'yon susunod.
 */

const fs = require("fs");
const path = require("path");

// Node 18+ has global fetch built in. Kung mas luma, i-uncomment ang linya sa baba
// at gawin ang `npm install node-fetch@2`
// const fetch = require("node-fetch");

const ACCESS_TOKEN = "PASTE_MO_DITO_ANG_TMDB_ACCESS_TOKEN_MO"; // <-- same value gaya ng nasa script.js
const BASE_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";
const SITE_URL = "https://allf1ix.github.io";
const SITE_NAME = "AllFlix";
const DEFAULT_IMAGE = `${SITE_URL}/og-default.jpg`;

const SITEMAP_PATH = path.join(__dirname, "sitemap.xml");
const TEMPLATE_PATH = path.join(__dirname, "index.html");
const OUTPUT_DIR = path.join(__dirname, "dist");

// ---------- 1. Kunin ang lahat ng /movie/ at /tv/ entries mula sa sitemap.xml ----------
function extractEntriesFromSitemap() {
    const xml = fs.readFileSync(SITEMAP_PATH, "utf8");
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);

    const entries = [];
    for (const url of locs) {
        const match = url.match(/\/(movie|tv)\/([a-z0-9-]*?-(\d+))\/?$/i);
        if (!match) continue; // homepage, /movies, /tv-shows, atbp. — skip
        entries.push({
            type: match[1].toLowerCase(),
            slug: match[2],
            id: match[3]
        });
    }
    return entries;
}

// ---------- 2. TMDB fetch (parehong endpoint/shape gaya ng openDetail() sa script.js) ----------
async function fetchDetails(type, id) {
    const url = `${BASE_URL}/${type}/${id}?append_to_response=credits,videos&language=en-US`;
    const res = await fetch(url, {
        headers: {
            accept: "application/json",
            Authorization: `Bearer ${ACCESS_TOKEN}`
        }
    });
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${type}/${id}`);
    return res.json();
}

function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

// ---------- 3. Buuin ang <head> meta block (kapareho ng updateSEO() sa script.js) ----------
function buildHead(data, type, canonicalPath) {
    const name = data.title || data.name;
    const year = (data.release_date || data.first_air_date || "").slice(0, 4);
    const title = `${name}${year ? " (" + year + ")" : ""} Trailer | ${SITE_NAME}`;
    const description = data.overview
        ? escapeHtml(data.overview.slice(0, 155))
        : `Panoorin ang official trailer ng ${escapeHtml(name)} sa ${SITE_NAME}.`;
    const image = data.backdrop_path
        ? BACKDROP_URL + data.backdrop_path
        : (data.poster_path ? IMG_URL + data.poster_path : DEFAULT_IMAGE);
    const canonicalUrl = SITE_URL + canonicalPath;

    // --- [NEW] enriched schema helpers (reuse ng data.credits / data.videos) ---
    const director = data.credits && data.credits.crew
        ? data.credits.crew.find(c => c.job === "Director")
        : null;

    const trailerVideo = data.videos && data.videos.results
        ? (data.videos.results.find(v => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
           data.videos.results.find(v => v.site === "YouTube" && v.type === "Trailer") ||
           data.videos.results.find(v => v.site === "YouTube"))
        : null;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": type === "tv" ? "TVSeries" : "Movie",
        name: name,
        description: data.overview || undefined,
        image: image,
        datePublished: data.release_date || data.first_air_date || undefined,
        genre: (data.genres || []).map(g => g.name),
        ...(data.vote_average ? {
            aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: data.vote_average.toFixed(1),
                bestRating: "10",
                ratingCount: data.vote_count || 1
            }
        } : {}),
        ...(director ? {
            director: {
                "@type": "Person",
                name: director.name
            }
        } : {}),
        ...(trailerVideo ? {
            trailer: {
                "@type": "VideoObject",
                name: `${name} Trailer`,
                embedUrl: `https://www.youtube.com/embed/${trailerVideo.key}`,
                thumbnailUrl: image,
                uploadDate: data.release_date || data.first_air_date || undefined
            }
        } : {})
    };

    return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonicalUrl}">

    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:type" content="video.other">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:image" content="${image}">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">

    <link rel="icon" type="image/jpeg" href="/og-default.jpg">
    <link rel="stylesheet" href="/style.css?v=12">

    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

// ---------- 4. Buuin ang laman ng detail section (totoong content, hindi placeholder) ----------
function buildDetailSection(data, type) {
    const title = escapeHtml(data.title || data.name);
    const runtimeMin = data.runtime || (data.episode_run_time && data.episode_run_time[0]) || 0;
    const hours = Math.floor(runtimeMin / 60);
    const mins = runtimeMin % 60;
    const poster = data.poster_path ? IMG_URL + data.poster_path : "";
    const rating = (data.vote_average || 0).toFixed(1);
    const releaseDate = data.release_date || data.first_air_date || "";
    const overview = escapeHtml(data.overview || "No overview available.");
    const genres = (data.genres || []).map(g => `<span class="detail-genre-pill">${escapeHtml(g.name)}</span>`).join("");
    const director = data.credits && data.credits.crew ? data.credits.crew.find(c => c.job === "Director") : null;
    const cast = (data.credits ? data.credits.cast : []).slice(0, 15).map(actor => {
        const photo = actor.profile_path ? IMG_URL + actor.profile_path : "";
        const safeName = escapeHtml(actor.name || "");
        return `<div class="cast-card">
            ${photo ? `<img src="${photo}" alt="${safeName}" loading="lazy">` : `<div class="cast-avatar-fallback">👤</div>`}
            <div class="cast-name">${safeName}</div>
            <div class="cast-role">${escapeHtml(actor.character || "")}</div>
        </div>`;
    }).join("");

    const videos = data.videos && data.videos.results ? data.videos.results : [];
    const trailer = videos.find(v => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
                    videos.find(v => v.site === "YouTube" && v.type === "Trailer") ||
                    videos.find(v => v.site === "YouTube");
    const trailerHtml = trailer
        ? `<iframe src="https://www.youtube.com/embed/${trailer.key}" title="Trailer" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
        : `<p class="empty-note">No trailer available.</p>`;

    return {
        title, poster, rating, runtimeMin, hours, mins, releaseDate,
        overview, genres, director, cast, trailerHtml, type
    };
}

// ---------- 5. I-assemble ang buong static page mula sa template ----------
function renderPage(templateHtml, data, type, canonicalPath) {
    let html = templateHtml;
    const head = buildHead(data, type, canonicalPath);
    const d = buildDetailSection(data, type);

    // Palitan ang buong <head>...</head> laman na SEO-related (mula sa <title> hanggang JSON-LD)
    html = html.replace(
        /<title>[\s\S]*?<\/script>\s*(?=<\/head>)/,
        head.trim() + "\n"
    );

    // I-set na visible agad ang detail section, itago ang hero/grid — para makita
    // ito ng crawlers/no-JS users nang direkta (JS ang bahala mag-adjust ulit later)
    html = html.replace(
        '<section class="detail-view" id="detailView" style="display: none;">',
        '<section class="detail-view" id="detailView" style="display: block;">'
    );
    html = html.replace(
        '<section class="hero" id="hero-banner">',
        '<section class="hero" id="hero-banner" style="display:none;">'
    );
    html = html.replace(
        /(<section class="media-container">)/,
        '<section class="media-container" style="display:none;">'
    );

    // Palitan ang mga placeholder ng totoong laman
    html = html
        .replace('<img id="detailPoster" src="" alt="Poster">', `<img id="detailPoster" src="${d.poster}" alt="${d.title}">`)
        .replace('<span class="detail-badge" id="detailType">MOVIE</span>', `<span class="detail-badge" id="detailType">${d.type.toUpperCase()}</span>`)
        .replace('<h1 id="detailTitle">Title</h1>', `<h1 id="detailTitle">${d.title}</h1>`)
        .replace('<span id="detailRating">⭐ 0.0</span>', `<span id="detailRating">⭐ ${d.rating}</span>`)
        .replace('<span id="detailRuntime"></span>', `<span id="detailRuntime">${d.runtimeMin ? `${d.hours}h ${d.mins}m` : ""}</span>`)
        .replace('<span id="detailRelease"></span>', `<span id="detailRelease">${d.releaseDate}</span>`)
        .replace('<p class="detail-overview" id="detailOverview">Overview...</p>', `<p class="detail-overview" id="detailOverview">${d.overview}</p>`)
        .replace('<div class="detail-genres" id="detailGenres"></div>', `<div class="detail-genres" id="detailGenres">${d.genres}</div>`)
        .replace('<div class="detail-cast-list" id="detailCast"></div>', `<div class="detail-cast-list" id="detailCast">${d.cast}</div>`)
        .replace(
            '<div class="detail-trailer-wrapper" id="detailTrailerWrapper">\n                    <p class="empty-note">No trailer available.</p>\n                </div>',
            `<div class="detail-trailer-wrapper" id="detailTrailerWrapper">${d.trailerHtml}</div>`
        );

    if (d.director) {
        html = html.replace(
            '<div class="detail-director" id="detailDirector"></div>',
            `<div class="detail-director" id="detailDirector" style="display:block;"><strong>Director:</strong> ${escapeHtml(d.director.name)}</div>`
        );
    }

    return html;
}

// ---------- MAIN ----------
async function main() {
    const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
    const entries = extractEntriesFromSitemap();
    console.log(`Found ${entries.length} movie/TV entries sa sitemap.xml`);

    let done = 0, failed = 0;
    for (const entry of entries) {
        const canonicalPath = `/${entry.type}/${entry.slug}`;
        const outDir = path.join(OUTPUT_DIR, entry.type, entry.slug);
        try {
            const data = await fetchDetails(entry.type, entry.id);
            const html = renderPage(template, data, entry.type, canonicalPath);

            fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");

            done++;
            if (done % 50 === 0) console.log(`  ...${done}/${entries.length}`);
        } catch (err) {
            failed++;
            console.error(`FAILED ${entry.type}/${entry.slug}:`, err.message);
        }

        // Konting delay para hindi ma-rate-limit ng TMDB (mahigpit ang limit nila
        // kapag maraming rapid requests galing sa parehong token)
        await new Promise(r => setTimeout(r, 120));
    }

    console.log(`\nTapos na. Nagawa: ${done}, Nabigo: ${failed}`);
    console.log(`I-copy mo ngayon ang laman ng "dist/" papunta sa repo mo (kasama pa rin`);
    console.log(`ang existing style.css, script.js, og-default.jpg, atbp. sa root) at i-push.`);
}

main();
