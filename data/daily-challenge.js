/*
 * HitYear Daily Challenge + Solo Player
 * Reto diario determinista, modo 1 jugador y reproductor reutilizable inspirado en el juego normal.
 */
(function initHitYearDailyChallenge() {
    const DAILY_SONG_COUNT = 7;
    const SOLO_DEFAULT_COUNT = 10;
    const STORAGE_PREFIX = 'hityear:daily-challenge';
    const RANKING_PREFIX = 'hityear:daily-ranking';
    const SOLO_STORAGE_PREFIX = 'hityear:solo-player';
    const MIN_YEAR = 1930;
    const MAX_YEAR = new Date().getFullYear();
    const $ = (id) => document.getElementById(id);

    const state = {
        date: todaySeed(),
        mode: 'daily',
        songs: [],
        answers: [],
        currentIndex: 0,
        startedAt: 0,
        audio: null,
        duration: 30,
        progressTimer: null,
        finished: false,
    };

    function todaySeed(date = new Date()) {
        return date.toISOString().slice(0, 10);
    }

    function onReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
            document.head.appendChild(script);
        });
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

    function seededShuffle(items, seed) {
        const random = mulberry32(hashSeed(seed));
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function randomShuffle(items) {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
        const total = Math.floor(seconds);
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    function getPlayerName() {
        return $('inp-username')?.value?.trim() || localStorage.getItem(`${STORAGE_PREFIX}:name`) || 'Jugador';
    }

    function savePlayerName(name) {
        localStorage.setItem(`${STORAGE_PREFIX}:name`, name || 'Jugador');
    }

    function resultKey(date = state.date) {
        return `${STORAGE_PREFIX}:${date}`;
    }

    function rankingKey(date = state.date) {
        return `${RANKING_PREFIX}:${date}`;
    }

    function readJson(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || '') || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function calcPoints(guessYear, actualYear, elapsedSeconds) {
        const diff = Math.abs(Number(guessYear) - Number(actualYear));
        let base = 0;
        if (diff === 0) base = 1000;
        else if (diff <= 1) base = 800;
        else if (diff <= 2) base = 600;
        else if (diff <= 3) base = 400;
        else if (diff <= 5) base = 200;
        else if (diff <= 10) base = 100;
        if (!base) return 0;
        return base + Math.max(0, Math.round(200 * (1 - Math.min(elapsedSeconds, 30) / 30)));
    }

    function injectStyles() {
        if ($('daily-challenge-styles')) return;
        const style = document.createElement('style');
        style.id = 'daily-challenge-styles';
        style.textContent = `
            .daily-card { background: linear-gradient(135deg, rgba(139, 92, 246, .16), rgba(236, 72, 153, .12)); border: 1px solid rgba(255, 255, 255, .12); box-shadow: 0 18px 48px rgba(0, 0, 0, .28); }
            .daily-screen { min-height: 100vh; background: radial-gradient(circle at top, rgba(236, 72, 153, .18), transparent 34%), #080812; }
            .daily-option { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); }
            .daily-option:focus-within { border-color: rgba(139, 92, 246, .85); }
            .daily-progress-dot { width: 10px; height: 10px; border-radius: 999px; background: rgba(255,255,255,.14); }
            .daily-progress-dot.done { background: linear-gradient(135deg, #8B5CF6, #EC4899); }
            .daily-audio-block .daily-play-button { width: 44px; height: 44px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .daily-audio-block .daily-progress-track { background: rgba(255, 255, 255, .1); border-radius: 4px; height: 6px; cursor: pointer; overflow: hidden; }
            .daily-audio-block .daily-progress-fill { height: 100%; background: linear-gradient(90deg, #8B5CF6, #EC4899); border-radius: 4px; width: 0%; transition: width .25s linear; }
            .daily-audio-block .daily-music-bar { width: 4px; border-radius: 2px; background: linear-gradient(180deg, #8B5CF6, #EC4899); animation: dailyMusicBounce var(--d, .8s) ease-in-out infinite; }
            .daily-audio-block .daily-music-bar.paused { animation-play-state: paused; }
            @keyframes dailyMusicBounce { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(.25); } }
        `;
        document.head.appendChild(style);
    }

    function ensureEntryPoints() {
        const welcomeCard = $('screen-welcome')?.querySelector('.glass.rounded-2xl');
        if (!welcomeCard) return;

        if (!$('btn-solo-player')) {
            const soloButton = document.createElement('button');
            soloButton.id = 'btn-solo-player';
            soloButton.type = 'button';
            soloButton.className = 'btn-grad w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2';
            soloButton.innerHTML = '<span>🎧</span><span>1 jugador</span><span class="text-white/75 font-normal">partida rápida</span>';
            soloButton.addEventListener('click', showSoloSetup);
            welcomeCard.appendChild(soloButton);
        }

        if (!$('btn-daily-challenge')) {
            const dailyButton = document.createElement('button');
            dailyButton.id = 'btn-daily-challenge';
            dailyButton.type = 'button';
            dailyButton.className = 'btn-ghost w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2';
            dailyButton.innerHTML = '<span>🌍</span><span>Reto diario</span><span class="text-gray-400 font-normal">misma lista para todos</span>';
            dailyButton.addEventListener('click', startDailyChallenge);
            welcomeCard.appendChild(dailyButton);
        }
    }

    function ensureGameScreen() {
        if ($('screen-daily-challenge')) return;
        const screen = document.createElement('div');
        screen.id = 'screen-daily-challenge';
        screen.className = 'screen daily-screen flex-col items-center justify-center p-4';
        screen.innerHTML = `
            <div class="w-full max-w-md fade-up space-y-4">
                <div class="text-center">
                    <p id="daily-kicker" class="text-xs text-gray-500 uppercase tracking-[.25em] font-bold">Daily challenge</p>
                    <h1 id="daily-title" class="text-4xl font-black gradient-text mt-1">Reto diario</h1>
                    <p id="daily-date" class="text-gray-500 text-sm mt-1"></p>
                </div>
                <div id="daily-content" class="daily-card rounded-3xl p-5"></div>
                <div id="daily-ranking" class="glass rounded-2xl p-4"></div>
                <button type="button" id="daily-back" class="btn-ghost w-full py-3 rounded-xl">Volver</button>
            </div>
        `;
        document.body.appendChild(screen);
        $('daily-back').addEventListener('click', () => {
            stopAudio();
            showScreen('screen-welcome');
        });
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
        $(id)?.classList.add('active');
    }

    async function loadAllSongs() {
        const themes = Array.isArray(window.HIT_THE_YEAR_THEMES) ? window.HIT_THE_YEAR_THEMES : HIT_THE_YEAR_THEMES;
        await Promise.all(themes.map((theme) => loadScript(`data/${theme.id}.js`).catch(() => null)));
        return themes
            .flatMap((theme) => Array.isArray(window[theme.variable]) ? window[theme.variable].map((song) => ({ ...song, themeId: theme.id, themeLabel: theme.label })) : [])
            .filter((song) => song && song.title && song.artist && Number.isFinite(Number(song.year)));
    }

    async function loadDailySongs(seed = state.date) {
        return seededShuffle(await loadAllSongs(), seed).slice(0, DAILY_SONG_COUNT);
    }

    async function loadSoloSongs(options = {}) {
        const count = Number(options.count) || SOLO_DEFAULT_COUNT;
        const themeId = options.themeId || 'all';
        const allSongs = await loadAllSongs();
        const filtered = themeId === 'all' ? allSongs : allSongs.filter((song) => song.themeId === themeId);
        return randomShuffle(filtered).slice(0, count);
    }

    function setHeader(mode) {
        state.mode = mode;
        $('daily-kicker').textContent = mode === 'daily' ? 'Daily challenge' : 'Solo player';
        $('daily-title').textContent = mode === 'daily' ? 'Reto diario' : '1 jugador';
        $('daily-date').textContent = mode === 'daily' ? `Reto de ${state.date}` : 'Partida local sin sala ni esperas';
        $('daily-ranking').classList.toggle('hidden', mode !== 'daily');
    }

    async function showSoloSetup() {
        injectStyles();
        ensureGameScreen();
        setHeader('solo');
        showScreen('screen-daily-challenge');
        stopAudio();
        const themes = Array.isArray(window.HIT_THE_YEAR_THEMES) ? window.HIT_THE_YEAR_THEMES : HIT_THE_YEAR_THEMES;
        const saved = readJson(`${SOLO_STORAGE_PREFIX}:settings`, { count: SOLO_DEFAULT_COUNT, themeId: 'all' });
        const options = ['<option value="all">Todas las categorías</option>'].concat(
            themes.map((theme) => `<option value="${escapeHtml(theme.id)}" ${saved.themeId === theme.id ? 'selected' : ''}>${escapeHtml(theme.label)}</option>`)
        ).join('');

        $('daily-content').innerHTML = `
            <div class="space-y-5">
                <div>
                    <p class="text-lg font-black text-white">Configura tu partida</p>
                    <p class="text-sm text-gray-400 mt-1">Juega tú solo con puntuación, resultados y previews como en el juego normal.</p>
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-1.5">Categoría</label>
                    <select id="solo-theme" class="styled">${options}</select>
                </div>
                <div>
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-300">Canciones</span>
                        <span id="solo-count-value" class="gradient-text font-bold">${Number(saved.count) || SOLO_DEFAULT_COUNT}</span>
                    </div>
                    <input id="solo-count" type="range" min="3" max="20" value="${Number(saved.count) || SOLO_DEFAULT_COUNT}" class="range-styled">
                    <div class="flex justify-between text-xs text-gray-600 mt-1"><span>3</span><span>20</span></div>
                </div>
                <button type="button" id="solo-start" class="btn-grad w-full py-3 rounded-xl">Empezar partida</button>
            </div>
        `;
        $('daily-ranking').innerHTML = renderSoloBestScore();
        $('solo-count').addEventListener('input', (event) => {
            $('solo-count-value').textContent = event.target.value;
        });
        $('solo-start').addEventListener('click', startSoloGame);
    }

    async function startSoloGame() {
        const settings = {
            themeId: $('solo-theme')?.value || 'all',
            count: Number($('solo-count')?.value) || SOLO_DEFAULT_COUNT,
        };
        writeJson(`${SOLO_STORAGE_PREFIX}:settings`, settings);
        setHeader('solo');
        $('daily-content').innerHTML = '<div class="text-center py-10 text-gray-400">Preparando partida…</div>';
        state.songs = await loadSoloSongs(settings);
        state.answers = [];
        state.currentIndex = 0;
        state.finished = false;
        if (!state.songs.length) {
            $('daily-content').innerHTML = '<div class="text-center py-10 text-red-300">No hay canciones disponibles para esta categoría.</div>';
            return;
        }
        renderQuestion();
    }

    async function startDailyChallenge() {
        injectStyles();
        ensureGameScreen();
        setHeader('daily');
        showScreen('screen-daily-challenge');
        $('daily-content').innerHTML = '<div class="text-center py-10 text-gray-400">Cargando canciones del día…</div>';
        renderRanking();

        const savedResult = readJson(resultKey(), null);
        state.songs = await loadDailySongs();
        state.answers = [];
        state.currentIndex = 0;
        state.finished = false;

        if (savedResult?.finished) {
            state.answers = savedResult.answers || [];
            state.finished = true;
            renderSummary(savedResult);
            renderRanking();
            return;
        }

        if (!state.songs.length) {
            $('daily-content').innerHTML = '<div class="text-center py-10 text-red-300">No hay canciones disponibles para generar el reto diario.</div>';
            return;
        }

        renderQuestion();
    }

    function renderQuestion() {
        stopAudio();
        const song = state.songs[state.currentIndex];
        state.startedAt = Date.now();
        const progress = state.songs.map((_, index) => `<span class="daily-progress-dot ${index < state.currentIndex ? 'done' : ''}"></span>`).join('');
        const currentGuess = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Number(song.year) || 1989));

        $('daily-content').innerHTML = `
            <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                    <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Canción ${state.currentIndex + 1}/${state.songs.length}</p>
                    <p class="text-lg font-black text-white">¿De qué año es?</p>
                </div>
                <div class="flex gap-1.5">${progress}</div>
            </div>
            <div class="daily-option rounded-2xl p-4 mb-4">
                <div class="flex gap-4 items-center">
                    <img src="${escapeHtml(song.cover || '')}" alt="" class="w-20 h-20 rounded-xl object-cover bg-white/5" loading="lazy">
                    <div class="min-w-0">
                        <p class="font-black text-white truncate">${escapeHtml(song.title)}</p>
                        <p class="text-gray-400 text-sm truncate">${escapeHtml(song.artist)}</p>
                        ${song.themeLabel ? `<p class="text-xs text-gray-600 truncate mt-1">${escapeHtml(song.themeLabel)}</p>` : ''}
                    </div>
                </div>
            </div>
            ${renderAudioPlayer(song)}
            <div class="space-y-3 mt-4">
                <div class="text-center"><span id="daily-year-value" class="text-5xl font-black gradient-text">${currentGuess}</span></div>
                <input id="daily-year-range" type="range" min="${MIN_YEAR}" max="${MAX_YEAR}" value="${currentGuess}" class="range-styled">
                <div class="flex justify-between text-xs text-gray-600"><span>${MIN_YEAR}</span><span>${MAX_YEAR}</span></div>
                <button type="button" id="daily-answer" class="btn-grad w-full py-3 rounded-xl">Confirmar año</button>
            </div>
        `;

        $('daily-year-range').addEventListener('input', (event) => {
            $('daily-year-value').textContent = event.target.value;
        });
        $('daily-answer').addEventListener('click', submitAnswer);
        bindAudioPlayer(song.preview);
    }

    function renderAudioPlayer(song) {
        if (!song.preview) {
            return `
                <div class="glass rounded-2xl p-4 text-center daily-audio-block">
                    <p class="text-xs text-gray-500">Sin preview disponible</p>
                </div>
            `;
        }

        return `
            <div class="glass rounded-2xl p-4 daily-audio-block">
                <div class="flex items-center gap-3">
                    <button id="daily-playpause" type="button" class="btn-grad daily-play-button text-lg" aria-label="Reproducir preview">▶</button>
                    <div class="flex-1 space-y-2">
                        <div class="flex items-end gap-1" style="height:22px" aria-hidden="true">
                            <div class="daily-music-bar paused" style="height:8px;--d:.5s"></div>
                            <div class="daily-music-bar paused" style="height:20px;--d:.75s"></div>
                            <div class="daily-music-bar paused" style="height:10px;--d:.6s"></div>
                            <div class="daily-music-bar paused" style="height:24px;--d:.95s"></div>
                            <div class="daily-music-bar paused" style="height:14px;--d:.7s"></div>
                            <div class="daily-music-bar paused" style="height:18px;--d:.85s"></div>
                        </div>
                        <div id="daily-progress-track" class="daily-progress-track">
                            <div id="daily-progress-fill" class="daily-progress-fill"></div>
                        </div>
                        <div class="flex justify-between text-xs text-gray-500">
                            <span id="daily-audio-cur">0:00</span>
                            <span id="daily-audio-dur">0:30</span>
                        </div>
                    </div>
                </div>
                <p id="daily-audio-error" class="hidden text-xs text-red-300 text-center mt-2">No se pudo reproducir el preview</p>
            </div>
        `;
    }

    function bindAudioPlayer(src) {
        const button = $('daily-playpause');
        const track = $('daily-progress-track');
        if (!button || !src) return;

        state.audio = new Audio();
        state.audio.preload = 'metadata';
        state.audio.src = src;

        state.audio.addEventListener('loadedmetadata', updateAudioUi);
        state.audio.addEventListener('timeupdate', updateAudioUi);
        state.audio.addEventListener('ended', () => {
            state.audio.currentTime = 0;
            updateAudioUi();
            setAudioPlaying(false);
        });
        state.audio.addEventListener('error', showAudioError);

        button.addEventListener('click', async () => {
            if (!state.audio) return;
            if (state.audio.paused) {
                try {
                    await state.audio.play();
                    setAudioPlaying(true);
                } catch (error) {
                    showAudioError();
                }
            } else {
                state.audio.pause();
                setAudioPlaying(false);
            }
        });

        track?.addEventListener('click', (event) => {
            if (!state.audio || !Number.isFinite(state.audio.duration) || state.audio.duration <= 0) return;
            const rect = track.getBoundingClientRect();
            const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            state.audio.currentTime = percent * state.audio.duration;
            updateAudioUi();
        });

        updateAudioUi();
    }

    function setAudioPlaying(isPlaying) {
        const button = $('daily-playpause');
        if (button) button.textContent = isPlaying ? '⏸' : '▶';
        document.querySelectorAll('.daily-audio-block .daily-music-bar').forEach((bar) => {
            bar.classList.toggle('paused', !isPlaying);
        });
    }

    function updateAudioUi() {
        const audio = state.audio;
        const duration = Number.isFinite(audio?.duration) && audio.duration > 0 ? audio.duration : state.duration;
        const current = Number.isFinite(audio?.currentTime) ? audio.currentTime : 0;
        const percent = duration ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
        if ($('daily-progress-fill')) $('daily-progress-fill').style.width = `${percent}%`;
        if ($('daily-audio-cur')) $('daily-audio-cur').textContent = formatTime(current);
        if ($('daily-audio-dur')) $('daily-audio-dur').textContent = formatTime(duration);
    }

    function showAudioError() {
        $('daily-audio-error')?.classList.remove('hidden');
        window.showRoundEvent?.('No se pudo reproducir el preview', 'warning');
        setAudioPlaying(false);
    }

    function submitAnswer() {
        const song = state.songs[state.currentIndex];
        const guess = Number($('daily-year-range')?.value);
        const elapsedSeconds = Math.round((Date.now() - state.startedAt) / 1000);
        const points = calcPoints(guess, Number(song.year), elapsedSeconds);
        const answer = {
            title: song.title,
            artist: song.artist,
            cover: song.cover || '',
            year: Number(song.year),
            guess,
            diff: Math.abs(guess - Number(song.year)),
            points,
        };
        state.answers.push(answer);
        stopAudio();

        if (guess === Number(song.year)) {
            window.showRoundEvent?.(`🎯 Año exacto: ${song.year}`, 'success');
            window.confetti?.(36);
        }

        state.currentIndex += 1;
        if (state.currentIndex >= state.songs.length) {
            finishGame();
        } else {
            renderReveal(answer);
        }
    }

    function renderReveal(answer) {
        $('daily-content').innerHTML = `
            <div class="text-center space-y-4">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Resultado</p>
                <div class="flex gap-4 items-center text-left glass rounded-2xl p-4">
                    <img src="${escapeHtml(answer.cover || '')}" alt="" class="w-16 h-16 rounded-xl object-cover bg-white/5" loading="lazy">
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
                <button type="button" id="daily-next" class="btn-grad w-full py-3 rounded-xl">Siguiente canción</button>
            </div>
        `;
        $('daily-next').addEventListener('click', renderQuestion);
    }

    function finishGame() {
        const score = state.answers.reduce((total, answer) => total + answer.points, 0);
        const exact = state.answers.filter((answer) => answer.diff === 0).length;
        const result = {
            date: state.date,
            mode: state.mode,
            name: getPlayerName(),
            score,
            exact,
            total: state.answers.length,
            answers: state.answers,
            finished: true,
            finishedAt: new Date().toISOString(),
        };
        savePlayerName(result.name);
        state.finished = true;

        if (state.mode === 'daily') {
            writeJson(resultKey(), result);
            saveRankingResult(result);
            window.showRoundEvent?.(`🏆 Reto diario completado: ${score} puntos`, 'leader');
            renderSummary(result);
            renderRanking();
        } else {
            saveSoloResult(result);
            window.showRoundEvent?.(`🏆 Partida completada: ${score} puntos`, 'leader');
            renderSummary(result);
            $('daily-ranking').classList.remove('hidden');
            $('daily-ranking').innerHTML = renderSoloBestScore();
        }
        window.confetti?.(48);
    }

    function saveRankingResult(result) {
        const ranking = readJson(rankingKey(), []);
        const withoutCurrent = ranking.filter((entry) => entry.name !== result.name);
        withoutCurrent.push({
            name: result.name,
            score: result.score,
            exact: result.exact,
            total: result.total,
            finishedAt: result.finishedAt,
        });
        withoutCurrent.sort((a, b) => b.score - a.score || b.exact - a.exact || String(a.finishedAt).localeCompare(String(b.finishedAt)));
        writeJson(rankingKey(), withoutCurrent.slice(0, 50));
    }

    function saveSoloResult(result) {
        const history = readJson(`${SOLO_STORAGE_PREFIX}:history`, []);
        history.push(result);
        history.sort((a, b) => b.score - a.score || b.exact - a.exact || String(a.finishedAt).localeCompare(String(b.finishedAt)));
        writeJson(`${SOLO_STORAGE_PREFIX}:history`, history.slice(0, 30));
    }

    function renderSoloBestScore() {
        const history = readJson(`${SOLO_STORAGE_PREFIX}:history`, []);
        if (!history.length) {
            return '<p class="text-gray-500 text-sm text-center py-4">Aún no tienes partidas de 1 jugador guardadas.</p>';
        }
        const best = history[0];
        return `
            <div class="flex items-center justify-between mb-2">
                <p class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Mejor partida 1 jugador</p>
                <span class="text-xs text-gray-600">local</span>
            </div>
            <div class="flex items-center justify-between gap-3 py-2">
                <span class="flex-1 font-bold truncate">${escapeHtml(best.name)}</span>
                <span class="text-xs text-gray-500">${best.exact}/${best.total} exactas</span>
                <span class="font-black gradient-text">${best.score}</span>
            </div>
        `;
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
        const isDaily = result.mode !== 'solo';

        $('daily-content').innerHTML = `
            <div class="text-center mb-5">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">${isDaily ? 'Resultado de hoy' : 'Resultado de la partida'}</p>
                <p class="text-6xl font-black gradient-text mt-1">${result.score}</p>
                <p class="text-gray-400 text-sm">${result.exact}/${result.total} años exactos</p>
            </div>
            <div class="glass rounded-2xl p-4 mb-4 max-h-64 overflow-auto">${rows}</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" id="daily-share" class="btn-grad py-3 rounded-xl">Compartir resultado</button>
                <button type="button" id="daily-history" class="btn-ghost py-3 rounded-xl">${isDaily ? 'Histórico' : 'Jugar otra'}</button>
            </div>
        `;
        $('daily-share').addEventListener('click', () => shareResult(result));
        $('daily-history').addEventListener('click', isDaily ? renderHistory : showSoloSetup);
    }

    function renderRanking() {
        const container = $('daily-ranking');
        if (!container) return;
        const ranking = readJson(rankingKey(), []);
        const rows = ranking.length
            ? ranking.slice(0, 10).map((entry, index) => `
                <div class="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-b-0">
                    <span class="text-gray-500 font-bold w-7">#${index + 1}</span>
                    <span class="flex-1 font-bold truncate">${escapeHtml(entry.name)}</span>
                    <span class="text-xs text-gray-500">${entry.exact}/${entry.total} exactas</span>
                    <span class="font-black gradient-text">${entry.score}</span>
                </div>
            `).join('')
            : '<p class="text-gray-500 text-sm text-center py-4">Todavía no hay resultados guardados para hoy.</p>';

        container.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <p class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Ranking diario</p>
                <span class="text-xs text-gray-600">${state.date}</span>
            </div>
            ${rows}
        `;
    }

    function renderHistory() {
        const entries = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(`${STORAGE_PREFIX}:20`)) {
                const result = readJson(key, null);
                if (result?.finished) entries.push(result);
            }
        }
        entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));

        const rows = entries.length
            ? entries.map((entry) => `
                <div class="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0">
                    <span class="font-bold">${entry.date}</span>
                    <span class="text-xs text-gray-500">${entry.exact}/${entry.total} exactas</span>
                    <span class="font-black gradient-text">${entry.score}</span>
                </div>
            `).join('')
            : '<p class="text-gray-500 text-sm text-center py-6">Aún no tienes histórico de retos diarios.</p>';

        $('daily-content').innerHTML = `
            <p class="text-xs text-gray-500 uppercase tracking-wider font-bold mb-3">Histórico</p>
            <div class="glass rounded-2xl p-4 mb-4">${rows}</div>
            <button type="button" id="daily-summary-back" class="btn-grad w-full py-3 rounded-xl">Volver al resultado</button>
        `;
        $('daily-summary-back').addEventListener('click', () => renderSummary(readJson(resultKey(), {})));
    }

    async function shareResult(result) {
        const label = result.mode === 'solo' ? 'una partida de 1 jugador' : 'el reto diario';
        const text = `He hecho ${result.score} puntos en ${label} de HitYear (${result.exact}/${result.total} exactas) 🎵 ${location.href}`;
        if (navigator.share) {
            await navigator.share({ title: 'HitYear', text }).catch(() => null);
            return;
        }
        await navigator.clipboard?.writeText(text).catch(() => null);
        window.showRoundEvent?.('📋 Resultado copiado', 'success');
    }

    function stopAudio() {
        if (state.progressTimer) {
            window.clearInterval(state.progressTimer);
            state.progressTimer = null;
        }
        if (state.audio) {
            state.audio.pause();
            state.audio.removeAttribute('src');
            state.audio.load();
            state.audio = null;
        }
        setAudioPlaying(false);
    }

    onReady(() => {
        injectStyles();
        ensureEntryPoints();
        ensureGameScreen();
        window.getDailyChallengeSongs = (seed = todaySeed()) => loadDailySongs(seed);
    });
}());
