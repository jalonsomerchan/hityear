/*
 * HitYear solo/daily replacement
 * - No muestra portada, título ni artista hasta contestar.
 * - Usa la API JSONP de Deezer por deezerId como fuente de datos y preview.
 */
(function initHitYearSoloDailyReplacement() {
    const DAILY_COUNT = 7;
    const DEFAULT_SOLO_COUNT = 10;
    const MIN_YEAR = 1930;
    const MAX_YEAR = new Date().getFullYear();
    const STORAGE_DAILY = 'hityear:daily-challenge';
    const STORAGE_DAILY_RANKING = 'hityear:daily-ranking';
    const STORAGE_SOLO = 'hityear:solo-player';
    const $ = (id) => document.getElementById(id);

    const state = {
        mode: 'daily',
        date: new Date().toISOString().slice(0, 10),
        songs: [],
        answers: [],
        index: 0,
        startedAt: 0,
        audio: null,
        trackCache: new Map(),
    };

    function onReady(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
        else fn();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function readJson(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
        catch (_) { return fallback; }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function getPlayerName() {
        return $('inp-username')?.value?.trim() || localStorage.getItem(`${STORAGE_DAILY}:name`) || 'Jugador';
    }

    function savePlayerName(name) {
        localStorage.setItem(`${STORAGE_DAILY}:name`, name || 'Jugador');
    }

    function hashSeed(seed) {
        let hash = 2166136261;
        for (let i = 0; i < seed.length; i += 1) {
            hash ^= seed.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function mulberry32(seed) {
        return function random() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffle(items, seed) {
        const random = seed ? mulberry32(hashSeed(seed)) : Math.random;
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function pointsFor(guess, actual, seconds) {
        const diff = Math.abs(Number(guess) - Number(actual));
        let base = 0;
        if (diff === 0) base = 1000;
        else if (diff <= 1) base = 800;
        else if (diff <= 2) base = 600;
        else if (diff <= 3) base = 400;
        else if (diff <= 5) base = 200;
        else if (diff <= 10) base = 100;
        return base ? base + Math.max(0, Math.round(200 * (1 - Math.min(seconds, 30) / 30))) : 0;
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const total = Math.floor(seconds);
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    function loadScript(src) {
        return new Promise((resolve) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = resolve;
            document.head.appendChild(script);
        });
    }

    async function loadAllSongs() {
        const themes = Array.isArray(window.HIT_THE_YEAR_THEMES) ? window.HIT_THE_YEAR_THEMES : [];
        await Promise.all(themes.map((theme) => loadScript(`data/${theme.id}.js`)));
        return themes.flatMap((theme) => {
            const list = Array.isArray(window[theme.variable]) ? window[theme.variable] : [];
            return list.map((song) => ({ ...song, themeId: theme.id, themeLabel: theme.label }));
        }).filter((song) => song.deezerId && Number.isFinite(Number(song.year)));
    }

    function fetchDeezerTrack(trackId) {
        return new Promise((resolve) => {
            if (!trackId) return resolve(null);

            const callback = `_dz${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const script = document.createElement('script');
            const cleanup = () => {
                delete window[callback];
                script.remove();
            };
            const timeout = window.setTimeout(() => {
                cleanup();
                resolve(null);
            }, 8000);

            window[callback] = (data) => {
                window.clearTimeout(timeout);
                cleanup();
                if (!data || data.error) return resolve(null);
                resolve(data);
            };

            script.onerror = () => {
                window.clearTimeout(timeout);
                cleanup();
                resolve(null);
            };

            script.src = `https://api.deezer.com/track/${encodeURIComponent(trackId)}?output=jsonp&callback=${callback}`;
            document.head.appendChild(script);
        });
    }

    function normalizeDeezerTrack(song, data) {
        if (!data) return null;
        return {
            id: data.id || song.deezerId,
            title: data.title || data.title_short || song.title || 'Canción',
            artist: data.artist?.name || song.artist || 'Artista desconocido',
            cover: data.album?.cover_medium || data.album?.cover_big || data.album?.cover || song.cover || '',
            preview: data.preview || '',
            releaseDate: data.release_date || data.album?.release_date || '',
        };
    }

    async function getTrack(song) {
        const key = String(song.deezerId || '');
        if (!key) return null;
        if (state.trackCache.has(key)) return state.trackCache.get(key);
        const data = await fetchDeezerTrack(key);
        const track = normalizeDeezerTrack(song, data);
        state.trackCache.set(key, track);
        return track;
    }

    function injectStyles() {
        if ($('solo-daily-fix-styles')) return;
        const style = document.createElement('style');
        style.id = 'solo-daily-fix-styles';
        style.textContent = `
            .sd-screen { min-height: 100vh; background: radial-gradient(circle at top, rgba(236,72,153,.18), transparent 34%), #080812; }
            .sd-card { background: linear-gradient(135deg, rgba(139,92,246,.16), rgba(236,72,153,.12)); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 18px 48px rgba(0,0,0,.28); }
            .sd-progress-dot { width: 10px; height: 10px; border-radius: 999px; background: rgba(255,255,255,.14); }
            .sd-progress-dot.done { background: linear-gradient(135deg, #8B5CF6, #EC4899); }
            .sd-player .sd-progress-track { background: rgba(255,255,255,.1); border-radius: 4px; height: 6px; cursor: pointer; overflow: hidden; }
            .sd-player .sd-progress-fill { height: 100%; background: linear-gradient(90deg,#8B5CF6,#EC4899); width: 0%; transition: width .25s linear; }
            .sd-bar { width: 4px; border-radius: 2px; background: linear-gradient(180deg,#8B5CF6,#EC4899); animation: sdBounce var(--d,.8s) ease-in-out infinite; }
            .sd-bar.paused { animation-play-state: paused; }
            @keyframes sdBounce { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(.25); } }
        `;
        document.head.appendChild(style);
    }

    function ensureScreen() {
        if ($('screen-solo-daily-fixed')) return;
        const screen = document.createElement('div');
        screen.id = 'screen-solo-daily-fixed';
        screen.className = 'screen sd-screen flex-col items-center justify-center p-4';
        screen.innerHTML = `
            <div class="w-full max-w-md fade-up space-y-4">
                <div class="text-center">
                    <p id="sd-kicker" class="text-xs text-gray-500 uppercase tracking-[.25em] font-bold"></p>
                    <h1 id="sd-title" class="text-4xl font-black gradient-text mt-1"></h1>
                    <p id="sd-subtitle" class="text-gray-500 text-sm mt-1"></p>
                </div>
                <div id="sd-content" class="sd-card rounded-3xl p-5"></div>
                <div id="sd-extra" class="glass rounded-2xl p-4"></div>
                <button type="button" id="sd-back" class="btn-ghost w-full py-3 rounded-xl">Volver</button>
            </div>
        `;
        document.body.appendChild(screen);
        $('sd-back').addEventListener('click', () => {
            stopAudio();
            showScreen('screen-welcome');
        });
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
        $(id)?.classList.add('active');
    }

    function setHeader(mode) {
        state.mode = mode;
        $('sd-kicker').textContent = mode === 'daily' ? 'Daily challenge' : 'Solo player';
        $('sd-title').textContent = mode === 'daily' ? 'Reto diario' : '1 jugador';
        $('sd-subtitle').textContent = mode === 'daily' ? `Reto de ${state.date}` : 'Partida local sin sala ni esperas';
        $('sd-extra').classList.toggle('hidden', false);
    }

    function installButtons() {
        const welcomeCard = $('screen-welcome')?.querySelector('.glass.rounded-2xl');
        if (!welcomeCard) return;

        $('btn-solo-player')?.remove();
        $('btn-daily-challenge')?.remove();

        const solo = document.createElement('button');
        solo.id = 'btn-solo-player';
        solo.type = 'button';
        solo.className = 'btn-grad w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2';
        solo.innerHTML = '<span>🎧</span><span>1 jugador</span><span class="text-white/75 font-normal">partida rápida</span>';
        solo.addEventListener('click', showSoloSetup);

        const daily = document.createElement('button');
        daily.id = 'btn-daily-challenge';
        daily.type = 'button';
        daily.className = 'btn-ghost w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2';
        daily.innerHTML = '<span>🌍</span><span>Reto diario</span><span class="text-gray-400 font-normal">misma lista para todos</span>';
        daily.addEventListener('click', startDaily);

        welcomeCard.appendChild(solo);
        welcomeCard.appendChild(daily);
    }

    async function showSoloSetup() {
        injectStyles();
        ensureScreen();
        setHeader('solo');
        showScreen('screen-solo-daily-fixed');
        stopAudio();

        const themes = Array.isArray(window.HIT_THE_YEAR_THEMES) ? window.HIT_THE_YEAR_THEMES : [];
        const saved = readJson(`${STORAGE_SOLO}:settings`, { count: DEFAULT_SOLO_COUNT, themeId: 'all' });
        const options = ['<option value="all">Todas las categorías</option>'].concat(
            themes.map((theme) => `<option value="${escapeHtml(theme.id)}" ${saved.themeId === theme.id ? 'selected' : ''}>${escapeHtml(theme.label)}</option>`)
        ).join('');

        $('sd-content').innerHTML = `
            <div class="space-y-5">
                <div>
                    <p class="text-lg font-black text-white">Configura tu partida</p>
                    <p class="text-sm text-gray-400 mt-1">Igual que el juego normal, pero sin crear sala.</p>
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-1.5">Categoría</label>
                    <select id="sd-solo-theme" class="styled">${options}</select>
                </div>
                <div>
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-300">Canciones</span>
                        <span id="sd-solo-count-value" class="gradient-text font-bold">${Number(saved.count) || DEFAULT_SOLO_COUNT}</span>
                    </div>
                    <input id="sd-solo-count" type="range" min="3" max="20" value="${Number(saved.count) || DEFAULT_SOLO_COUNT}" class="range-styled">
                    <div class="flex justify-between text-xs text-gray-600 mt-1"><span>3</span><span>20</span></div>
                </div>
                <button type="button" id="sd-solo-start" class="btn-grad w-full py-3 rounded-xl">Empezar partida</button>
            </div>
        `;
        $('sd-extra').innerHTML = renderSoloBest();
        $('sd-solo-count').addEventListener('input', (event) => $('sd-solo-count-value').textContent = event.target.value);
        $('sd-solo-start').addEventListener('click', startSolo);
    }

    async function startSolo() {
        const settings = {
            themeId: $('sd-solo-theme')?.value || 'all',
            count: Number($('sd-solo-count')?.value) || DEFAULT_SOLO_COUNT,
        };
        writeJson(`${STORAGE_SOLO}:settings`, settings);
        setHeader('solo');
        $('sd-content').innerHTML = '<div class="text-center py-10 text-gray-400">Preparando partida…</div>';
        const allSongs = await loadAllSongs();
        const filtered = settings.themeId === 'all' ? allSongs : allSongs.filter((song) => song.themeId === settings.themeId);
        state.songs = shuffle(filtered).slice(0, settings.count);
        state.answers = [];
        state.index = 0;
        if (!state.songs.length) {
            $('sd-content').innerHTML = '<div class="text-center py-10 text-red-300">No hay canciones disponibles para esta categoría.</div>';
            return;
        }
        renderQuestion();
    }

    async function startDaily() {
        injectStyles();
        ensureScreen();
        setHeader('daily');
        showScreen('screen-solo-daily-fixed');
        stopAudio();
        renderDailyRanking();

        const saved = readJson(`${STORAGE_DAILY}:${state.date}`, null);
        if (saved?.finished) {
            renderSummary(saved);
            renderDailyRanking();
            return;
        }

        $('sd-content').innerHTML = '<div class="text-center py-10 text-gray-400">Cargando canciones del día…</div>';
        state.songs = shuffle(await loadAllSongs(), state.date).slice(0, DAILY_COUNT);
        state.answers = [];
        state.index = 0;
        if (!state.songs.length) {
            $('sd-content').innerHTML = '<div class="text-center py-10 text-red-300">No hay canciones disponibles para generar el reto diario.</div>';
            return;
        }
        renderQuestion();
    }

    function renderQuestion() {
        stopAudio();
        const song = state.songs[state.index];
        state.startedAt = Date.now();
        const currentGuess = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Number(song.year) || 1989));
        const progress = state.songs.map((_, index) => `<span class="sd-progress-dot ${index < state.index ? 'done' : ''}"></span>`).join('');
        $('sd-content').innerHTML = `
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Canción ${state.index + 1}/${state.songs.length}</p>
                    <p class="text-lg font-black text-white">¿De qué año es?</p>
                </div>
                <div class="flex gap-1.5">${progress}</div>
            </div>
            <div class="glass rounded-2xl p-5 text-center mb-4">
                <div class="text-4xl mb-2">🎵</div>
                <p class="font-black text-white">Canción oculta</p>
                <p class="text-sm text-gray-500 mt-1">Escucha el fragmento y adivina el año.</p>
            </div>
            ${renderPlayer(Boolean(song.deezerId))}
            <div class="space-y-3 mt-4">
                <div class="text-center"><span id="sd-year-value" class="text-5xl font-black gradient-text">${currentGuess}</span></div>
                <input id="sd-year-range" type="range" min="${MIN_YEAR}" max="${MAX_YEAR}" value="${currentGuess}" class="range-styled">
                <div class="flex justify-between text-xs text-gray-600"><span>${MIN_YEAR}</span><span>${MAX_YEAR}</span></div>
                <button type="button" id="sd-answer" class="btn-grad w-full py-3 rounded-xl">Confirmar año</button>
            </div>
        `;
        $('sd-year-range').addEventListener('input', (event) => $('sd-year-value').textContent = event.target.value);
        $('sd-answer').addEventListener('click', () => submitAnswer());
        bindPlayer(song);
        getTrack(song).then((track) => {
            if (!track?.preview && $('sd-audio-error')) $('sd-audio-error').textContent = 'Esta canción no tiene preview en Deezer';
        });
    }

    function renderPlayer(canPlay) {
        if (!canPlay) return '<div class="glass rounded-2xl p-4 text-center text-xs text-gray-500">Sin deezerId para consultar preview</div>';
        return `
            <div class="glass rounded-2xl p-4 sd-player">
                <div class="flex items-center gap-3">
                    <button id="sd-play" type="button" class="btn-grad w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-lg">▶</button>
                    <div class="flex-1 space-y-2">
                        <div class="flex items-end gap-1" style="height:22px" aria-hidden="true">
                            <span class="sd-bar paused" style="height:8px;--d:.5s"></span><span class="sd-bar paused" style="height:20px;--d:.75s"></span><span class="sd-bar paused" style="height:10px;--d:.6s"></span><span class="sd-bar paused" style="height:24px;--d:.95s"></span><span class="sd-bar paused" style="height:14px;--d:.7s"></span><span class="sd-bar paused" style="height:18px;--d:.85s"></span>
                        </div>
                        <div id="sd-track" class="sd-progress-track"><div id="sd-fill" class="sd-progress-fill"></div></div>
                        <div class="flex justify-between text-xs text-gray-500"><span id="sd-cur">0:00</span><span id="sd-dur">0:30</span></div>
                    </div>
                </div>
                <p id="sd-audio-error" class="hidden text-xs text-red-300 text-center mt-2">No se pudo reproducir el preview desde Deezer</p>
            </div>
        `;
    }

    function bindPlayer(song) {
        const button = $('sd-play');
        const track = $('sd-track');
        if (!button) return;
        button.addEventListener('click', async () => {
            try {
                if (!state.audio) {
                    button.textContent = '…';
                    const trackData = await getTrack(song);
                    if (!trackData?.preview) throw new Error('Sin preview en Deezer');
                    state.audio = new Audio(trackData.preview);
                    state.audio.preload = 'metadata';
                    state.audio.addEventListener('timeupdate', updateAudioUi);
                    state.audio.addEventListener('loadedmetadata', updateAudioUi);
                    state.audio.addEventListener('ended', () => {
                        state.audio.currentTime = 0;
                        setAudioPlaying(false);
                        updateAudioUi();
                    });
                    state.audio.addEventListener('error', showAudioError);
                }
                if (state.audio.paused) {
                    await state.audio.play();
                    setAudioPlaying(true);
                } else {
                    state.audio.pause();
                    setAudioPlaying(false);
                }
            } catch (_) {
                showAudioError();
            }
        });
        track?.addEventListener('click', (event) => {
            if (!state.audio || !Number.isFinite(state.audio.duration) || state.audio.duration <= 0) return;
            const rect = track.getBoundingClientRect();
            state.audio.currentTime = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * state.audio.duration;
            updateAudioUi();
        });
    }

    function setAudioPlaying(playing) {
        if ($('sd-play')) $('sd-play').textContent = playing ? '⏸' : '▶';
        document.querySelectorAll('.sd-bar').forEach((bar) => bar.classList.toggle('paused', !playing));
    }

    function updateAudioUi() {
        const audio = state.audio;
        const duration = Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : 30;
        const current = Number.isFinite(audio?.currentTime) ? audio.currentTime : 0;
        if ($('sd-fill')) $('sd-fill').style.width = `${Math.min(100, Math.max(0, current / duration * 100))}%`;
        if ($('sd-cur')) $('sd-cur').textContent = formatTime(current);
        if ($('sd-dur')) $('sd-dur').textContent = formatTime(duration);
    }

    function showAudioError() {
        $('sd-audio-error')?.classList.remove('hidden');
        window.showRoundEvent?.('No se pudo reproducir el preview desde Deezer', 'warning');
        setAudioPlaying(false);
    }

    function stopAudio() {
        if (!state.audio) return;
        state.audio.pause();
        state.audio.removeAttribute('src');
        state.audio.load();
        state.audio = null;
        setAudioPlaying(false);
    }

    async function submitAnswer() {
        const song = state.songs[state.index];
        const guess = Number($('sd-year-range')?.value);
        const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
        const trackData = await getTrack(song);
        const answer = {
            title: trackData?.title || song.title || 'Canción',
            artist: trackData?.artist || song.artist || 'Artista desconocido',
            cover: trackData?.cover || song.cover || '',
            year: Number(song.year),
            guess,
            diff: Math.abs(guess - Number(song.year)),
            points: pointsFor(guess, Number(song.year), elapsed),
        };
        stopAudio();
        state.answers.push(answer);
        state.index += 1;
        if (guess === Number(song.year)) {
            window.showRoundEvent?.(`🎯 Año exacto: ${song.year}`, 'success');
            window.confetti?.(36);
        }
        if (state.index >= state.songs.length) finishGame();
        else renderReveal(answer);
    }

    function renderReveal(answer) {
        $('sd-content').innerHTML = `
            <div class="text-center space-y-4">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Resultado</p>
                <div class="flex gap-4 items-center text-left glass rounded-2xl p-4">
                    <img src="${escapeHtml(answer.cover)}" alt="" class="w-16 h-16 rounded-xl object-cover bg-white/5" loading="lazy">
                    <div class="min-w-0">
                        <p class="text-xl font-black text-white truncate">${escapeHtml(answer.title)}</p>
                        <p class="text-gray-400 text-sm truncate">${escapeHtml(answer.artist)}</p>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="glass rounded-2xl p-3"><p class="text-xs text-gray-500">Tu año</p><p class="text-2xl font-black">${answer.guess}</p></div>
                    <div class="glass rounded-2xl p-3"><p class="text-xs text-gray-500">Real</p><p class="text-2xl font-black gradient-text">${answer.year}</p></div>
                    <div class="glass rounded-2xl p-3"><p class="text-xs text-gray-500">Pts</p><p class="text-2xl font-black">${answer.points}</p></div>
                </div>
                <button type="button" id="sd-next" class="btn-grad w-full py-3 rounded-xl">Siguiente canción</button>
            </div>
        `;
        $('sd-next').addEventListener('click', renderQuestion);
    }

    function finishGame() {
        const result = {
            date: state.date,
            mode: state.mode,
            name: getPlayerName(),
            score: state.answers.reduce((sum, answer) => sum + answer.points, 0),
            exact: state.answers.filter((answer) => answer.diff === 0).length,
            total: state.answers.length,
            answers: state.answers,
            finished: true,
            finishedAt: new Date().toISOString(),
        };
        savePlayerName(result.name);
        if (state.mode === 'daily') {
            writeJson(`${STORAGE_DAILY}:${state.date}`, result);
            saveDailyRanking(result);
            renderSummary(result);
            renderDailyRanking();
        } else {
            saveSoloResult(result);
            renderSummary(result);
            $('sd-extra').innerHTML = renderSoloBest();
        }
        window.showRoundEvent?.(`🏆 Partida completada: ${result.score} puntos`, 'leader');
        window.confetti?.(48);
    }

    function saveDailyRanking(result) {
        const key = `${STORAGE_DAILY_RANKING}:${state.date}`;
        const ranking = readJson(key, []).filter((entry) => entry.name !== result.name);
        ranking.push({ name: result.name, score: result.score, exact: result.exact, total: result.total, finishedAt: result.finishedAt });
        ranking.sort((a, b) => b.score - a.score || b.exact - a.exact || String(a.finishedAt).localeCompare(String(b.finishedAt)));
        writeJson(key, ranking.slice(0, 50));
    }

    function saveSoloResult(result) {
        const history = readJson(`${STORAGE_SOLO}:history`, []);
        history.push(result);
        history.sort((a, b) => b.score - a.score || b.exact - a.exact || String(a.finishedAt).localeCompare(String(b.finishedAt)));
        writeJson(`${STORAGE_SOLO}:history`, history.slice(0, 30));
    }

    function renderSummary(result) {
        const rows = result.answers.map((answer) => `
            <div class="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-b-0">
                <div class="min-w-0">
                    <p class="font-bold text-white truncate">${escapeHtml(answer.title)}</p>
                    <p class="text-xs text-gray-500 truncate">${escapeHtml(answer.artist)} · ${answer.guess} → ${answer.year}</p>
                </div>
                <span class="font-black ${answer.diff === 0 ? 'gradient-text' : 'text-white'}">${answer.points}</span>
            </div>
        `).join('');
        $('sd-content').innerHTML = `
            <div class="text-center mb-5">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">${result.mode === 'daily' ? 'Resultado de hoy' : 'Resultado de la partida'}</p>
                <p class="text-6xl font-black gradient-text mt-1">${result.score}</p>
                <p class="text-gray-400 text-sm">${result.exact}/${result.total} años exactos</p>
            </div>
            <div class="glass rounded-2xl p-4 mb-4 max-h-64 overflow-auto">${rows}</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" id="sd-share" class="btn-grad py-3 rounded-xl">Compartir resultado</button>
                <button type="button" id="sd-again" class="btn-ghost py-3 rounded-xl">${result.mode === 'daily' ? 'Volver' : 'Jugar otra'}</button>
            </div>
        `;
        $('sd-share').addEventListener('click', () => shareResult(result));
        $('sd-again').addEventListener('click', result.mode === 'daily' ? startDaily : showSoloSetup);
    }

    function renderDailyRanking() {
        const ranking = readJson(`${STORAGE_DAILY_RANKING}:${state.date}`, []);
        $('sd-extra').innerHTML = ranking.length ? `
            <div class="flex items-center justify-between mb-2"><p class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Ranking diario</p><span class="text-xs text-gray-600">${state.date}</span></div>
            ${ranking.slice(0, 10).map((entry, index) => `<div class="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-b-0"><span class="text-gray-500 font-bold w-7">#${index + 1}</span><span class="flex-1 font-bold truncate">${escapeHtml(entry.name)}</span><span class="text-xs text-gray-500">${entry.exact}/${entry.total} exactas</span><span class="font-black gradient-text">${entry.score}</span></div>`).join('')}
        ` : '<p class="text-gray-500 text-sm text-center py-4">Todavía no hay resultados guardados para hoy.</p>';
    }

    function renderSoloBest() {
        const history = readJson(`${STORAGE_SOLO}:history`, []);
        if (!history.length) return '<p class="text-gray-500 text-sm text-center py-4">Aún no tienes partidas de 1 jugador guardadas.</p>';
        const best = history[0];
        return `<div class="flex items-center justify-between mb-2"><p class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Mejor partida 1 jugador</p><span class="text-xs text-gray-600">local</span></div><div class="flex items-center justify-between gap-3 py-2"><span class="flex-1 font-bold truncate">${escapeHtml(best.name)}</span><span class="text-xs text-gray-500">${best.exact}/${best.total} exactas</span><span class="font-black gradient-text">${best.score}</span></div>`;
    }

    async function shareResult(result) {
        const label = result.mode === 'daily' ? 'el reto diario' : 'una partida de 1 jugador';
        const text = `He hecho ${result.score} puntos en ${label} de HitYear (${result.exact}/${result.total} exactas) 🎵 ${location.href}`;
        if (navigator.share) {
            await navigator.share({ title: 'HitYear', text }).catch(() => null);
            return;
        }
        await navigator.clipboard?.writeText(text).catch(() => null);
        window.showRoundEvent?.('📋 Resultado copiado', 'success');
    }

    onReady(() => {
        injectStyles();
        ensureScreen();
        window.setTimeout(installButtons, 150);
        window.setTimeout(installButtons, 800);
    });
}());
