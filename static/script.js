const INITIAL_LIMIT = 6;
const INCREMENT = 6;

// Store current visible counts for each category
const visibilityMap = {
    'list-cracked': INITIAL_LIMIT,
    'list-uncracked': INITIAL_LIMIT,
    'list-upcoming': INITIAL_LIMIT
};

let gamesData = null;
const steamCache = {};

async function init() {
    document.getElementById('app').innerHTML = `
            <div class="loading-container">
                <div class="spinner"></div>
                <span>Loading CrackWatch data...</span>
            </div>
        `;
    try {
        const res = await fetch('/api/games');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        gamesData = await res.json();
        if (gamesData.error) throw new Error(gamesData.error);
    } catch (err) {
        document.getElementById('app').innerHTML = `<div class="no-results" style="padding:60px;text-align:center;color:#ef4444;">❌ Error loading data: ${err.message}</div>`;
        return;
    }
    document.getElementById('app').innerHTML = `
            <div class="fade-in">
                <section id="sec-cracked">
                    <div class="section-header">
                        <div style="width:14px;height:14px;border-radius:4px;background:var(--accent-cracked)"></div>
                        <h2>Cracked Games</h2>
                    </div>
                    <div id="list-cracked" class="grid"></div>
                    <div id="more-cracked" class="show-more-container"></div>
                </section>
                <section id="sec-uncracked">
                    <div class="section-header">
                        <div style="width:14px;height:14px;border-radius:4px;background:var(--accent-uncracked)"></div>
                        <h2>Uncracked Titles</h2>
                    </div>
                    <div id="list-uncracked" class="grid"></div>
                    <div id="more-uncracked" class="show-more-container"></div>
                </section>
                <section id="sec-upcoming">
                    <div class="section-header">
                        <div style="width:14px;height:14px;border-radius:4px;background:var(--accent-upcoming)"></div>
                        <h2>Upcoming Releases</h2>
                    </div>
                    <div id="list-upcoming" class="grid"></div>
                    <div id="more-upcoming" class="show-more-container"></div>
                </section>
            </div>`;
    updateStats();
    renderAll();
}

function updateStats() {
    const d = gamesData;
    const statsElement = document.getElementById('stats');

    // Naplnenie HTML obsahu
    statsElement.innerHTML = `
        <div class="stat-item stat-db" style="transition-delay: 0.1s">DB: <b>${d.cracked.length + d.uncracked.length + d.upcoming.length}</b></div>
        <div class="stat-item stat-cracked" style="transition-delay: 0.2s">Cracked: <b>${d.cracked.length}</b></div>
        <div class="stat-item stat-uncracked" style="transition-delay: 0.3s">Uncracked: <b>${d.uncracked.length}</b></div>
        <div class="stat-item stat-upcoming" style="transition-delay: 0.4s">Upcoming: <b>${d.upcoming.length}</b></div>
    `;

    // Spustenie animácie v ďalšom frame
    requestAnimationFrame(() => {
        statsElement.classList.add('visible');
    });
}

function renderCategory(list, elementId, buttonId, badgeClass, borderClass, isSearch = false) {
    const container = document.getElementById(elementId);
    const btnContainer = document.getElementById(buttonId);
    const currentLimit = visibilityMap[elementId];

    if (list.length === 0) {
        container.innerHTML = '<div class="no-results">No games found matching your search.</div>';
        btnContainer.innerHTML = '';
        return;
    }

    container.innerHTML = list.map((game, i) => {
        const isHidden = i >= currentLimit;
        // For search or initial load, we might want to animate the first batch
        const shouldAnimate = isSearch || i < INITIAL_LIMIT;
        const delay = shouldAnimate ? (i % 6) * 0.1 : 0;
        const animClass = shouldAnimate ? 'animate-in' : '';

        return `
                <div class="card ${borderClass} ${isHidden ? 'hidden' : ''} ${animClass}"
                     style="animation-delay: ${delay}s"
                     data-index="${i}"
                     onclick="openGameModal('${game.id}')">
                    <div class="card-image" style="background-image: url('${game.images.header || game.images.cover}')">
                        <span class="badge ${badgeClass}">${game.status_info.badge}</span>
                    </div>
                    <div class="card-content">
                        <h3 class="game-title">${game.title}</h3>
                        <div class="info-row"><span class="label">DRM Protection</span><span class="value">${game.details.drm}</span></div>
                        <div class="info-row"><span class="label">Release Date</span><span class="value">${game.details.release_date}</span></div>
                        <div class="info-row"><span class="label">Scene Group</span><span class="value">${game.details.scene_group || 'N/A'}</span></div>
                        <p class="description">${game.details.description || 'No description available for this title.'}</p>
                    </div>
                </div>
            `;
    }).join('');

    updateButtons(list.length, elementId, buttonId);
}

function updateButtons(totalCount, elementId, buttonId) {
    const btnContainer = document.getElementById(buttonId);
    const currentVisible = visibilityMap[elementId];

    if (totalCount > currentVisible) {
        btnContainer.innerHTML = `
                <button class="btn-show-more" onclick="loadMore('${elementId}', '${buttonId}')">Load Next</button>
                <button class="btn-show-more btn-outline" onclick="showEverything('${elementId}', '${buttonId}')">Show All (${totalCount})</button>
            `;
    } else {
        btnContainer.innerHTML = `<span style="color:var(--text-dim); font-size: 0.8rem; font-weight: 800; letter-spacing: 0.1em;">END OF CATEGORY</span>`;
    }
}

function preloadImages(urls) {
    const promises = urls.map(url => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve; // Continue even if an image fails to load
            img.src = url;
        });
    });
    return Promise.all(promises);
}

async function loadMore(elementId, buttonId) {
    const btnContainer = document.getElementById(buttonId);
    const container = document.getElementById(elementId);

    // Show small loader in the button area
    btnContainer.innerHTML = `
            <div class="loading-container" style="padding: 10px; flex-direction: row; gap: 12px;">
                <div class="spinner" style="width: 20px; height: 20px; border-width: 3px;"></div>
                <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;">Loading...</span>
            </div>
        `;

    const categoryKey = elementId.replace('list-', '');
    const list = gamesData[categoryKey];
    const oldLimit = visibilityMap[elementId];
    const nextLimit = oldLimit + INCREMENT;

    // Get URLs for cards that are about to be shown
    const newImages = list.slice(oldLimit, nextLimit)
        .map(g => g.images.header || g.images.cover)
        .filter(Boolean);

    // Wait for images to load in background
    await preloadImages(newImages);

    visibilityMap[elementId] = nextLimit;

    // Reveal existing hidden cards and animate only them
    const cards = container.querySelectorAll('.card.hidden');
    let animatedCount = 0;
    cards.forEach((card) => {
        const idx = parseInt(card.getAttribute('data-index'));
        if (idx >= oldLimit && idx < nextLimit) {
            card.classList.remove('hidden');
            card.style.animationDelay = `${(animatedCount % 6) * 0.1}s`;
            card.classList.add('animate-in');
            animatedCount++;
        }
    });

    updateButtons(list.length, elementId, buttonId);
}

async function showEverything(elementId, buttonId) {
    const btnContainer = document.getElementById(buttonId);
    const container = document.getElementById(elementId);

    btnContainer.innerHTML = `
            <div class="loading-container" style="padding: 10px; flex-direction: row; gap: 12px;">
                <div class="spinner" style="width: 20px; height: 20px; border-width: 3px;"></div>
                <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em;">Preparing all...</span>
            </div>
        `;

    const categoryKey = elementId.replace('list-', '');
    const list = gamesData[categoryKey];
    const oldLimit = visibilityMap[elementId];

    // Preload all remaining images in this category
    const allImages = list.slice(oldLimit)
        .map(g => g.images.header || g.images.cover)
        .filter(Boolean);

    await preloadImages(allImages);

    visibilityMap[elementId] = 9999;

    const cards = container.querySelectorAll('.card.hidden');
    let animatedCount = 0;
    cards.forEach((card) => {
        card.classList.remove('hidden');
        card.style.animationDelay = `${(animatedCount % 12) * 0.05}s`;
        card.classList.add('animate-in');
        animatedCount++;
    });

    updateButtons(list.length, elementId, buttonId);
}
function renderAll() {
    renderCategory(gamesData.cracked, 'list-cracked', 'more-cracked', 'bg-cracked', 'border-cracked');
    renderCategory(gamesData.uncracked, 'list-uncracked', 'more-uncracked', 'bg-uncracked', 'border-uncracked');
    renderCategory(gamesData.upcoming, 'list-upcoming', 'more-upcoming', 'bg-upcoming', 'border-upcoming');
}

function openGameModal(gameId) {
    const allGames = [...gamesData.cracked, ...gamesData.uncracked, ...gamesData.upcoming];
    const game = allGames.find(g => String(g.id) === String(gameId));
    if (!game) return;

    // 1. RESET EVERYTHING INVISIBLY FIRST
    const modalBody = document.querySelector('.modal-body');
    const modalMain = document.querySelector('.modal-main');
    if (modalBody) modalBody.scrollTop = 0;
    if (modalMain) modalMain.scrollTop = 0;

    const modalHeader = document.getElementById('modalHeader');
    const scrollBtn = document.getElementById('modalScrollTopBtn');
    if (scrollBtn) scrollBtn.classList.remove('visible');

    // 2. SHOW LOADER
    document.getElementById('modalLoadingOverlay').classList.remove('hidden');
    document.getElementById('modalContentWrapper').classList.add('hidden');
    document.getElementById('popupModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Pre-fill static data
    document.getElementById('modalTitle').textContent = game.title;
    document.getElementById('modalStatus').textContent = game.status_info.badge || 'UNKNOWN';
    document.getElementById('modalDrm').textContent = game.details.drm || 'N/A';
    document.getElementById('modalReleaseDate').textContent = game.details.release_date || 'TBA';
    const crackDate = (String(game.status_info.badge || '').toLowerCase().includes('cracked'))
        ? (game.details.crack_date || 'N/A')
        : 'N/A';
    document.getElementById('modalCrackDate').textContent = crackDate;
    document.getElementById('modalSceneGroup').textContent = game.details.scene_group || 'N/A';

    const previewImage = game.images.cover || game.images.header || '';
    document.getElementById('modalHeader').style.backgroundImage = `url('${previewImage}')`;
    document.getElementById('modalSummaryImage').src = previewImage;

    document.getElementById('modalStoreLink').href = `https://store.steampowered.com/search/?term=${encodeURIComponent(game.title)}`;

    // Clear previous gameplay content
    document.getElementById('gameplaySection').style.display = '';
    document.getElementById('gameplaySection').classList.add('hidden');
    document.getElementById('youtubeContainer').innerHTML = '';

    // Reset sekcií (zobrazenie)
    const modalSidebar = document.querySelector('.modal-sidebar');
    const modalGrid = document.querySelector('.modal-grid');
    if (modalSidebar) modalSidebar.classList.remove('hidden');
    if (modalGrid) modalGrid.classList.remove('no-sidebar');

    document.querySelectorAll('#modalFullDescription, #modalSteamRequirements, #gameMetadataSection, #steamMetadataSection').forEach(el => {
        el.style.display = '';
        el.classList.remove('hidden');
    });
    // Reset nadpisov
    document.querySelectorAll('.modal-section h3, #gameMetadataHeading, #steamMetadataHeading').forEach(el => {
        el.style.display = '';
    });

    // Reset all Steam-populated fields
    document.getElementById('modalStoreHeadline').textContent = '';
    document.getElementById('modalSteamPlatform').textContent = '…';
    document.getElementById('modalSteamGenres').textContent = '…';
    document.getElementById('modalSteamPublisher').textContent = '…';
    document.getElementById('modalSteamPrice').textContent = '…';
    document.getElementById('modalFullDescription').innerHTML = '<div class="modal-status-text">Loading game description...</div>';
    document.getElementById('modalSteamRequirements').innerHTML = '<div class="modal-status-text">Loading Steam requirements...</div>';

    // Hide all section errors
    ['modalSteamError', 'modalDescriptionError', 'modalMetaError'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = ''; el.classList.add('hidden'); }
    });

    // Fetch deep details
    fetchSteamDetails(game.title).catch(error => {
        console.error('Steam fetch error:', error);

        // 1. Skrytie celých sekcií a ich nadpisov
        document.querySelectorAll('#modalFullDescription, #modalSteamRequirements, .modal-requirements, #gameMetadataSection, #steamMetadataSection').forEach(el => {
            el.style.display = 'none';
        });
        
        // Skrytie celého sidebar-u
        if (modalSidebar) modalSidebar.classList.add('hidden');
        if (modalGrid) modalGrid.classList.add('no-sidebar');

        document.querySelectorAll('h3').forEach(h3 => {
            if (h3.innerText.includes('Full description') || 
                h3.innerText.includes('System requirements from Steam') || 
                h3.innerText.includes('Steam metadata') ||
                h3.innerText.includes('Game info')) {
                h3.style.display = 'none';
            }
        });

        // 2. Vyčistenie Store headline
        document.getElementById('modalStoreHeadline').textContent = '';

        // 3. Reset scrollu na vrchol
        const modalBody = document.querySelector('.modal-body');
        if (modalBody) modalBody.scrollTop = 0;

        // Hide loader and show content
        document.getElementById('modalLoadingOverlay').classList.add('hidden');
        document.getElementById('modalContentWrapper').classList.remove('hidden');
    });

    if (!game.status_info.is_upcoming) {
        fetchGameplayVideo(game.title);
    }

}
async function fetchSteamDetails(query) {
    if (steamCache[query]) {
        setTimeout(() => renderSteamDetails(steamCache[query]), 400);
        return;
    }

    try {
        const response = await fetch(`/api/steam?query=${encodeURIComponent(query)}`);

        // Zobrazenie chyby v konzole len raz, ak je iná než 502 (Bad Gateway)
        if (!response.ok) {
            if (response.status !== 502) {
                console.warn(`Steam fetch warning: ${response.status}`);
            }
            throw new Error(`Steam lookup failed (${response.status})`);
        }

        const result = await response.json();
        if (result.error) throw new Error(result.error);

        steamCache[query] = result;
        setTimeout(() => renderSteamDetails(result), 200);
    } catch (err) {
        // Ignorujeme 502 chybu pri logovaní, pretože ju ošetrujeme v catch bloku openGameModal
        if (!err.message.includes('502')) {
            console.error('Steam fetch error:', err);
        }
        throw err; // Vyhodíme chybu ďalej, aby sa spracovala v openGameModal
    }
}

function extractSteamPcSections(html) {
    if (!html) return null;
    const cleanHtml = html.replace(/\r/g, '').replace(/\n/g, '').trim();
    const minMatch = cleanHtml.match(/<strong>\s*Minimum\s*:?<\/strong>/i);
    const recMatch = cleanHtml.match(/<strong>\s*Recommended\s*:?<\/strong>/i);
    if (!minMatch) {
        return { minimum: cleanHtml, recommended: '' };
    }

    const afterMin = cleanHtml.slice(minMatch.index + minMatch[0].length);
    if (!recMatch) {
        return { minimum: afterMin.trim(), recommended: '' };
    }

    const afterRec = afterMin.slice(recMatch.index - (minMatch.index + minMatch[0].length) + recMatch[0].length);
    const minHtml = afterMin.slice(0, recMatch.index - (minMatch.index + minMatch[0].length)).trim();
    return { minimum: minHtml, recommended: afterRec.trim() };
}

function normalizeSteamHtml(html) {
    return html
        .replace(/<p>\s*<\/p>/gi, '')
        .replace(/<br\s*\/?>(\s*<br\s*\/?>)*/gi, '<br>')
        .replace(/<strong>\s*Minimum\s*:?<\/strong>/gi, '')
        .replace(/<strong>\s*Recommended\s*:?<\/strong>/gi, '')
        .replace(/^[\s\n\r]*<br\s*\/?>(\s*)/gi, '')
        .trim();
}

function getSteamRequirementIcon(label) {
    const key = (label || '').toLowerCase();
    if (/os|operating system/.test(key)) {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 4h18v16H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 11h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
    if (/processor|cpu/.test(key)) {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 3v3M15 3v3M9 21v-3M15 21v-3M3 9h3M3 15h3M21 9h-3M21 15h-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
    if (/graphics|video|gpu|vga|card/.test(key)) {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7" width="18" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 15h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
    if (/memory|ram/.test(key)) {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="7" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 7v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 7v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
    if (/storage|disk|drive/.test(key)) {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 18v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15 18v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
    if (/sound/.test(key)) {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 9h4l5-5v16l-5-5H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 8c1.5 1.5 1.5 3.5 0 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 5.5c3 3 3 7.5 0 10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
    if (/network|internet|online/.test(key)) {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3v18M6.5 6.5l11 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
}

function renderSteamRequirementDetails(rawHtml) {
    if (!rawHtml) return '<div class="modal-status-text">No requirement details available.</div>';
    const normalized = rawHtml
        .replace(/<\/?ul>/gi, '')
        .replace(/<\/li>/gi, '<br>')
        .replace(/<\/p>/gi, '<br>')
        .replace(/<br\s*\/?>(\s*<br\s*\/?>)*/gi, '<br>')
        .replace(/<strong>\s*([\w\s]+):?\s*<\/strong>/gi, '$1: ')
        .replace(/<(?!br\s*\/?)[^>]+>/gi, '')
        .split(/<br\s*\/?\s*>/gi)
        .map(line => line.trim())
        .filter(Boolean);

    return normalized.map(line => {
        const [label, ...rest] = line.split(/:\s*/);
        const value = rest.join(':').trim();
        const icon = getSteamRequirementIcon(label);
        if (!value) {
            return `<div class="req-line">${line}</div>`;
        }
        return `
                <div class="req-row">
                    <div class="req-icon">${icon}</div>
                    <div class="req-meta">
                        <div class="req-label">${label}</div>
                        <div class="req-value">${value}</div>
                    </div>
                </div>`;
    }).join('');
}

function renderSteamDetails(steam) {
    // Clear all section errors first
    ['modalSteamError', 'modalDescriptionError', 'modalMetaError'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = ''; el.classList.add('hidden'); }
    });

    document.getElementById('modalStoreLink').href = steam.steam_url || document.getElementById('modalStoreLink').href;
    const steamLinkText2 = document.querySelector('#modalStoreLink .steam-link-text');
    if (steamLinkText2) steamLinkText2.textContent = steam.steam_url ? 'Open Steam page' : 'View on Steam';
    document.getElementById('modalSteamPlatform').textContent = steam.platforms || 'N/A';
    document.getElementById('modalSteamGenres').textContent = steam.genres || 'N/A';
    document.getElementById('modalSteamPublisher').textContent = steam.publishers || 'N/A';
    document.getElementById('modalSteamPrice').textContent = steam.price || 'Free / unavailable';
    document.getElementById('modalStoreHeadline').textContent = steam.short_description || 'Steam details loaded.';

    const description = steam.about_the_game || steam.detailed_description || steam.short_description || 'No Steam description available.';
    document.getElementById('modalFullDescription').innerHTML = description;

    const sections = extractSteamPcSections(steam.pc_requirements);
    if (sections && sections.minimum) {
        const minimumHtml = normalizeSteamHtml(sections.minimum);
        const recommendedHtml = normalizeSteamHtml(sections.recommended);
        let rightColumn = '';
        if (recommendedHtml) {
            rightColumn = `<div class="steam-breakdown"><div class="steam-subtitle">Recommended</div>${renderSteamRequirementDetails(recommendedHtml)}</div>`;
        }
        document.getElementById('modalSteamRequirements').innerHTML = `
                <div class="steam-requirement-windows">
                    <div class="steam-requirement-header">
                        <span class="section-icon"><svg class="icon-svg" viewBox="0 0 24 24"><path d="M3 7h18M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path></svg></span>
                        <div>
                            <div class="steam-requirement-tag">Windows</div>
                            <div class="steam-requirement-title">System requirements</div>
                        </div>
                    </div>
                    <div class="steam-requirement-grid">
                        <div class="steam-breakdown"><div class="steam-subtitle">Minimum</div>${renderSteamRequirementDetails(minimumHtml)}</div>
                        ${rightColumn}
                    </div>
                </div>`;
    } else {
        document.getElementById('modalSteamRequirements').innerHTML = '<div class="modal-status-text">No requirements found on Steam.</div>';
    }

    // IMPORTANT: Hide loader and show content
    document.getElementById('modalLoadingOverlay').classList.add('hidden');
    document.getElementById('modalContentWrapper').classList.remove('hidden');

    // FORCE RESET SCROLL again now that content is visible
    setTimeout(() => {
        const modalBody = document.querySelector('.modal-body');
        if (modalBody) modalBody.scrollTop = 0;

        // Also ensure sections are reset if they have their own scroll
        const modalMain = document.querySelector('.modal-main');
        if (modalMain) modalMain.scrollTop = 0;
    }, 50);
}

async function fetchGameplayVideo(title) {
    const gameplaySection = document.getElementById('gameplaySection');
    const youtubeContainer = document.getElementById('youtubeContainer');
    const youtubeMoreBtn = document.getElementById('youtubeMoreBtn');

    // Show loading overlay immediately
    gameplaySection.classList.remove('hidden');
    youtubeContainer.innerHTML = `
            <div class="video-loading-overlay">
                <div class="video-loading-text">Searching for gameplay...</div>
                <div class="progress-bar-container" style="width: 160px; height: 3px;">
                    <div class="progress-bar-fill"></div>
                </div>
            </div>
        `;

    // Update YouTube search link
    youtubeMoreBtn.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' gameplay')}`;

    try {
        const response = await fetch(`/api/youtube?query=${encodeURIComponent(title)}`);
        const data = await response.json();

        if (data.videoId) {
            // Smooth transition: small delay to avoid flicker
            setTimeout(() => {
                youtubeContainer.innerHTML = `
                        <iframe id="youtubePlayer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
                                src="https://www.youtube.com/embed/${data.videoId}"
                                frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowfullscreen></iframe>
                    `;
            }, 300);
        } else {
            gameplaySection.classList.add('hidden');
        }
    } catch (err) {
        console.error('YouTube fetch error:', err);
        gameplaySection.classList.add('hidden');
    }
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('popupModal').classList.add('hidden');
    document.body.style.overflow = '';

    // Stop YouTube video
    const youtubePlayer = document.getElementById('youtubePlayer');
    if (youtubePlayer) youtubePlayer.src = '';

    const modalBody = document.querySelector('.modal-body');
    if (modalBody) modalBody.scrollTop = 0;
    const scrollBtn = document.getElementById('modalScrollTopBtn');
    if (scrollBtn) scrollBtn.classList.remove('visible');
}

function scrollModalTop() {
    const modalBody = document.querySelector('.modal-body');
    if (!modalBody) return;
    modalBody.scrollTo({ top: 0, behavior: 'smooth' });
    const scrollBtn = document.getElementById('modalScrollTopBtn');
    if (scrollBtn) scrollBtn.classList.remove('visible');
}

function setupModalScrollButton() {
    const modalBody = document.querySelector('.modal-body');
    const scrollBtn = document.getElementById('modalScrollTopBtn');

    if (!modalBody || !scrollBtn) return;

    modalBody.addEventListener('scroll', () => {
        const scrollTop = modalBody.scrollTop;
        const isMobile = window.innerWidth <= 700;
        const threshold = isMobile ? 10 : 140;

        if (scrollTop > threshold) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });
}

function setupPageScrollButton() {
    const pageBtn = document.getElementById('pageScrollTopBtn');
    if (!pageBtn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 320) {
            pageBtn.classList.add('visible');
        } else {
            pageBtn.classList.remove('visible');
        }
    });
}

function scrollPageTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSearch() {
    const searchInput = document.getElementById('gameSearch');
    if (!searchInput) return;
    searchInput.value = '';
    filterGames();
    const resetBtn = document.getElementById('searchResetBtn');
    if (resetBtn) resetBtn.classList.remove('visible');
}

let filterTimeout = null;

function filterGames() {
    // Ak používateľ stlačí klávesu, zrušíme predchádzajúce čakanie
    if (filterTimeout) clearTimeout(filterTimeout);

    const searchInput = document.getElementById('gameSearch');
    const query = (searchInput ? searchInput.value : '').toLowerCase();
    const resetBtn = document.getElementById('searchResetBtn');

    // Tlačidlo na reset (krížik) zobrazíme/skryjeme okamžite
    if (resetBtn) resetBtn.classList.toggle('visible', query.length > 0);

    const sections = ['cracked', 'uncracked', 'upcoming'];

    // Nastavíme nové čakanie (500ms) kým sa spustí vizuálne načítavanie a logika
    filterTimeout = setTimeout(() => {

        // 1. ZOBRAZENIE LOADERU (len ak nie je query prázdne)
        if (query.length > 0) {
            sections.forEach(s => {
                const listId = `list-${s}`;
                const btnId = `more-${s}`;
                document.getElementById(listId).innerHTML = `
                        <div class="search-loading-overlay">
                            <div class="search-loading-text">Searching database...</div>
                            <div class="progress-bar-container"><div class="progress-bar-fill"></div></div>
                        </div>
                    `;
                document.getElementById(btnId).innerHTML = '';
            });
        }

        // 2. SAMOTNÉ FILTROVANIE A VYKRESLENIE
        // Pridáme malý delay (300ms), aby loader len nepreblikol, ale bol chvíľu vidieť
        setTimeout(async () => {
            const searchResults = {};
            let allImageUrls = [];

            sections.forEach(s => {
                const filtered = gamesData[s].filter(g =>
                    g.title.toLowerCase().includes(query) ||
                    g.details.drm.toLowerCase().includes(query) ||
                    (g.details.scene_group && g.details.scene_group.toLowerCase().includes(query))
                );
                searchResults[s] = filtered;
                
                if (query.length > 0) {
                    filtered.forEach(g => {
                        const url = g.images.header || g.images.cover;
                        if (url) allImageUrls.push(url);
                    });
                }
            });

            // Ak vyhľadávame, počkáme na obrázky
            if (query.length > 0 && allImageUrls.length > 0) {
                await preloadImages(allImageUrls);
            }

            sections.forEach(s => {
                const filtered = searchResults[s];
                const listId = `list-${s}`;
                const btnId = `more-${s}`;
                const badge = s === 'cracked' ? 'bg-cracked' : (s === 'upcoming' ? 'bg-upcoming' : 'bg-uncracked');
                const border = s === 'cracked' ? 'border-cracked' : (s === 'upcoming' ? 'border-upcoming' : 'border-uncracked');

                if (query.length > 0) {
                    const originalLimit = visibilityMap[listId];
                    visibilityMap[listId] = 9999; // Pri hľadaní ukážeme všetko
                    renderCategory(filtered, listId, btnId, badge, border, true);
                    visibilityMap[listId] = originalLimit;
                    document.getElementById(btnId).innerHTML = '';
                } else {
                    // Ak je vyhľadávanie prázdne, vrátime pôvodné zoznamy
                    renderCategory(gamesData[s], listId, btnId, badge, border, false);
                }
            });
        }, query.length > 0 ? 300 : 0);

    }, query.length > 0 ? 500 : 0);
}
window.onload = () => {
    init();
    setupModalScrollButton();
    setupPageScrollButton();
};