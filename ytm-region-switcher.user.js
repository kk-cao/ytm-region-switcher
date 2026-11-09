// ==UserScript==
// @name         YouTube Music 彻底告别土区 (探索页净化 + 排行榜自选固定地区)
// @namespace    https://github.com/kk-cao/ytm-region-switcher
// @version      5.0.0
// @description  1. 拦截“探索/新发行”接口剥离土区账单锁，自动按代理IP显示欧美/港台新歌；2. 排行榜旁新增“📌 固定地区”自选按钮并自动静默切换
// @author       kk-cao
// @match        https://music.youtube.com/*
// @run-at       document-start
// @grant        none
// @homepageURL  https://github.com/kk-cao/ytm-region-switcher
// @downloadURL  https://raw.githubusercontent.com/kk-cao/ytm-region-switcher/main/ytm-region-switcher.user.js
// @updateURL    https://raw.githubusercontent.com/kk-cao/ytm-region-switcher/main/ytm-region-switcher.user.js
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'ytm_pinned_chart_region';
    const BILLING_REGIONS = ['土耳其', 'Turkey', 'Türkiye'];
    const EXPLORE_BROWSE_IDS = [
        'FEmusic_explore',
        'FEmusic_new_releases',
        'FEmusic_new_releases_albums',
        'FEmusic_new_releases_videos'
    ];

    let lastSwitchTime = 0;
    let wasOnCharts = false;
    let forceSwitchOnEntry = true;
    let lastInterceptedBrowseId = null;
    let initialExploreReplaced = false;

    // =========================================================================
    // 1. 拦截“探索 (Explore)”与“新发行”接口：剥离土区账单凭证，按代理 IP 返回新歌
    // =========================================================================
    const origStringify = window.JSON.stringify;
    window.JSON.stringify = function (value, replacer, space) {
        try {
            if (value && typeof value === 'object' && typeof value.browseId === 'string') {
                lastInterceptedBrowseId = value.browseId;
            }
        } catch (e) {}
        return origStringify.call(this, value, replacer, space);
    };

    const origFetch = window.fetch;
    window.fetch = async function (input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.includes('/youtubei/v1/browse') && EXPLORE_BROWSE_IDS.includes(lastInterceptedBrowseId)) {
                lastInterceptedBrowseId = null;
                const headers = new Headers(input instanceof Request ? input.headers : (init && init.headers));
                headers.delete('Authorization');
                headers.delete('X-Goog-AuthUser');
                headers.delete('X-Goog-PageId');
                headers.delete('X-Goog-Visitor-Id');

                const body = input instanceof Request ? await input.clone().arrayBuffer() : (init && init.body);
                return origFetch.call(this, url, {
                    method: 'POST',
                    headers,
                    body,
                    credentials: 'omit',
                    mode: 'cors'
                });
            }
        } catch (e) {}
        return origFetch.apply(this, arguments);
    };

    // 若直接在 /explore 页面按 F5 刷新，自动热替换首屏 SSR 的土区数据
    async function refreshInitialExploreIfNeeded() {
        if (initialExploreReplaced) return;
        if (!location.pathname.startsWith('/explore') && !location.pathname.startsWith('/new_releases')) return;
        if (!window.ytcfg || typeof window.ytcfg.get !== 'function') return;

        const sectionEl = document.querySelector('ytmusic-browse-response ytmusic-section-list-renderer');
        const sectionPolymer = sectionEl ? (sectionEl.wrappedJSObject || sectionEl) : null;
        if (!sectionPolymer || !sectionPolymer.data) return;

        initialExploreReplaced = true;
        try {
            const apiKey = window.ytcfg.get('INNERTUBE_API_KEY');
            const baseCtx = origStringify(window.ytcfg.get('INNERTUBE_CONTEXT'));
            if (!apiKey || !baseCtx) return;

            const ctx = JSON.parse(baseCtx);
            const browseId = location.pathname.startsWith('/new_releases/albums')
                ? 'FEmusic_new_releases_albums'
                : location.pathname.startsWith('/new_releases/videos')
                ? 'FEmusic_new_releases_videos'
                : location.pathname.startsWith('/new_releases')
                ? 'FEmusic_new_releases'
                : 'FEmusic_explore';

            const res = await origFetch.call(window, 'https://music.youtube.com/youtubei/v1/browse?key=' + apiKey + '&prettyPrint=false', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: origStringify({ context: ctx, browseId })
            });
            const json = await res.json();
            const newSectionList = json?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
            if (newSectionList && sectionPolymer) {
                sectionPolymer.data = newSectionList;
            }
        } catch (e) {}
    }

    // =========================================================================
    // 2. “排行榜 (Charts)”页面：新增“📌 固定地区”胶囊按钮并自动静默切换
    // =========================================================================
    function getPinnedRegion() {
        return localStorage.getItem(STORAGE_KEY) || '香港';
    }

    function setPinnedRegion(region) {
        localStorage.setItem(STORAGE_KEY, region);
        updatePinButtonText();
    }

    function getRenderer() {
        const el = document.querySelector('ytmusic-sort-filter-button-renderer');
        return el ? (el.wrappedJSObject || el) : null;
    }

    function switchToRegion(targetRegion) {
        if (!targetRegion || targetRegion === 'OFF') return false;
        const renderer = getRenderer();
        if (!renderer || !renderer.data) return false;

        const currentTitle = renderer.data?.title?.runs?.[0]?.text?.trim() || '';
        if (currentTitle === targetRegion) return true;

        const options = renderer.data?.menu?.musicMultiSelectMenuRenderer?.options || [];
        const targetOpt = options.find(
            o => o?.musicMultiSelectMenuItemRenderer?.title?.runs?.[0]?.text?.trim() === targetRegion
        );
        const cmd = targetOpt?.musicMultiSelectMenuItemRenderer?.selectedCommand;
        if (!cmd) return false;

        lastSwitchTime = Date.now();
        renderer.dispatchEvent(new CustomEvent('yt-action', {
            bubbles: true,
            composed: true,
            detail: {
                actionName: 'yt-service-request',
                args: [renderer, cmd]
            }
        }));
        return true;
    }

    function updatePinButtonText() {
        const label = document.getElementById('ytm-pin-region-label');
        if (!label) return;
        const pinned = getPinnedRegion();
        label.textContent = pinned === 'OFF' ? '📌 固定地区: 未开启' : '📌 固定地区: ' + pinned;
    }

    function ensureStyle() {
        if (document.getElementById('ytm-pin-region-style')) return;
        const style = document.createElement('style');
        style.id = 'ytm-pin-region-style';
        style.textContent = `
            #ytm-pin-region-container {
                display: inline-flex;
                position: relative;
                vertical-align: middle;
                margin-left: 12px;
                z-index: 9999;
                font-family: Roboto, Noto Naskh Arabic UI, Arial, sans-serif;
            }
            #ytm-pin-region-btn {
                height: 38px;
                padding: 8px 14px 8px 16px;
                border-radius: 20px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                font-size: 14px;
                font-weight: 500;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                transition: background 0.15s ease, border-color 0.15s ease;
                user-select: none;
                outline: none;
            }
            #ytm-pin-region-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.3);
            }
            #ytm-pin-region-menu {
                display: none;
                position: absolute;
                top: 44px;
                left: 0;
                width: 240px;
                max-height: 420px;
                background: #212121;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                box-shadow: 0 16px 24px 2px rgba(0, 0, 0, 0.5), 0 6px 30px 5px rgba(0, 0, 0, 0.4);
                overflow: hidden;
                flex-direction: column;
            }
            #ytm-pin-region-menu.open {
                display: flex;
            }
            #ytm-pin-region-header {
                padding: 12px 16px 8px;
                font-size: 13px;
                color: #aaa;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            #ytm-pin-region-search {
                margin: 8px 12px;
                padding: 6px 10px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.18);
                background: #121212;
                color: #fff;
                font-size: 13px;
                outline: none;
            }
            #ytm-pin-region-search:focus {
                border-color: #fff;
            }
            #ytm-pin-region-list {
                overflow-y: auto;
                max-height: 320px;
                padding: 4px 0;
            }
            #ytm-pin-region-list::-webkit-scrollbar {
                width: 6px;
            }
            #ytm-pin-region-list::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.25);
                border-radius: 3px;
            }
            .ytm-pin-item {
                padding: 9px 16px;
                font-size: 14px;
                color: #f1f1f1;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .ytm-pin-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            .ytm-pin-item.active {
                color: #fff;
                font-weight: 600;
                background: rgba(255, 255, 255, 0.14);
            }
        `;
        document.head.appendChild(style);
    }

    function renderMenuItems(filterText = '') {
        const listEl = document.getElementById('ytm-pin-region-list');
        const renderer = getRenderer();
        if (!listEl || !renderer || !renderer.data) return;

        const options = renderer.data?.menu?.musicMultiSelectMenuRenderer?.options || [];
        const countries = options
            .map(o => o?.musicMultiSelectMenuItemRenderer?.title?.runs?.[0]?.text?.trim())
            .filter(Boolean);

        const priority = ['香港', '美国', '全球', '日本', '韩国', '英国', '新加坡', '加拿大'];
        const sorted = [
            ...priority.filter(c => countries.includes(c)),
            ...countries.filter(c => !priority.includes(c))
        ];

        const pinned = getPinnedRegion();
        const kw = filterText.trim().toLowerCase();
        listEl.replaceChildren();

        for (const name of sorted) {
            if (kw && !name.toLowerCase().includes(kw)) continue;
            const item = document.createElement('div');
            item.className = 'ytm-pin-item' + (name === pinned ? ' active' : '');

            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;
            const checkSpan = document.createElement('span');
            checkSpan.textContent = name === pinned ? '✓' : '';

            item.appendChild(nameSpan);
            item.appendChild(checkSpan);

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                setPinnedRegion(name);
                document.getElementById('ytm-pin-region-menu')?.classList.remove('open');
                switchToRegion(name);
            });
            listEl.appendChild(item);
        }
    }

    function ensurePinUI() {
        const renderer = document.querySelector('ytmusic-sort-filter-button-renderer');
        if (!renderer) return;
        if (document.getElementById('ytm-pin-region-container')) {
            updatePinButtonText();
            return;
        }

        ensureStyle();
        const container = document.createElement('div');
        container.id = 'ytm-pin-region-container';

        const btn = document.createElement('button');
        btn.id = 'ytm-pin-region-btn';
        btn.type = 'button';
        btn.title = '选择进入排行榜时自动固定的默认国家/地区';

        const label = document.createElement('span');
        label.id = 'ytm-pin-region-label';

        const arrow = document.createElement('span');
        arrow.textContent = '▾';
        arrow.style.fontSize = '12px';
        arrow.style.opacity = '0.8';

        btn.appendChild(label);
        btn.appendChild(arrow);

        const menu = document.createElement('div');
        menu.id = 'ytm-pin-region-menu';

        const header = document.createElement('div');
        header.id = 'ytm-pin-region-header';
        header.textContent = '选择默认固定的国家/地区';

        const searchInput = document.createElement('input');
        searchInput.id = 'ytm-pin-region-search';
        searchInput.type = 'text';
        searchInput.placeholder = '搜索国家/地区...';

        const list = document.createElement('div');
        list.id = 'ytm-pin-region-list';

        menu.appendChild(header);
        menu.appendChild(searchInput);
        menu.appendChild(list);

        container.appendChild(btn);
        container.appendChild(menu);

        renderer.style.display = 'inline-flex';
        renderer.style.alignItems = 'center';
        renderer.appendChild(container);
        updatePinButtonText();

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menu.classList.toggle('open');
            if (isOpen) {
                searchInput.value = '';
                renderMenuItems('');
                setTimeout(() => searchInput.focus(), 50);
            }
        });

        searchInput.addEventListener('click', e => e.stopPropagation());
        searchInput.addEventListener('input', () => renderMenuItems(searchInput.value));

        document.addEventListener('click', () => {
            menu.classList.remove('open');
        });
    }

    function tick() {
        if (location.pathname.startsWith('/explore') || location.pathname.startsWith('/new_releases')) {
            refreshInitialExploreIfNeeded();
        } else {
            initialExploreReplaced = false;
        }

        const isCharts = location.pathname.startsWith('/charts');
        if (!isCharts) {
            wasOnCharts = false;
            return;
        }
        if (!wasOnCharts) {
            wasOnCharts = true;
            forceSwitchOnEntry = true;
        }

        ensurePinUI();

        const renderer = getRenderer();
        if (!renderer || !renderer.data) return;

        const currentTitle = renderer.data?.title?.runs?.[0]?.text?.trim() || '';
        const pinned = getPinnedRegion();
        if (!pinned || pinned === 'OFF') return;

        if (currentTitle === pinned) {
            forceSwitchOnEntry = false;
            return;
        }

        if ((forceSwitchOnEntry || BILLING_REGIONS.includes(currentTitle)) && Date.now() - lastSwitchTime > 2000) {
            if (switchToRegion(pinned)) {
                forceSwitchOnEntry = false;
            }
        }
    }

    setInterval(tick, 300);
})();
