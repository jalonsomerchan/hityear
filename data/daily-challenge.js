/*
 * HitYear Daily Challenge
 * Reto diario determinista, persistencia local y ranking diario preparado para sustituirse por API.
 */
(function initHitYearDailyChallenge() {
    const DAILY_SONG_COUNT = 7;
    const STORAGE_PREFIX = 'hityear:daily-challenge';
    const RANKING_PREFIX = 'hityear:daily-ranking';
    const $ = (id) => document.getElementById(id);

    const state = {
        date: todaySeed(),
        songs: [],
        answers: [],
        currentIndex: 0,
        startedAt: 0,
        audio: null,
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

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
        `;
        document.head.appendChild(style);
    }

    function ensureDailyEntryPoint() {
        if ($('btn-daily-challenge')) return;
        const welcomeCard = $('screen-welcome')?.querySelector('.glass.rounded-2xl');
        if (!welcomeCard) return;

        const button = document.createElement('button');
        button.id = 'btn-daily-challenge';
        button.type = 'button';
        button.className = 'btn-ghost w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2';
        button.innerHTML = '<span>🌍</span><span>Reto diario</span><span class="text-gray-400 font-normal">misma lista para todos</span>';
        button.addEventListener('click', startDailyChallenge);
        welcomeCard.appendChild(button);
    }

    function ensureDailyScreen() {
        if ($('screen-daily-challenge')) return;
        const screen = document.createElement('div');
        screen.id = 'screen-daily-challenge';
        screen.className = 'screen daily-screen flex-col items-center justify-center p-4';
        screen.innerHTML = `
            <div class="w-full max-w-md fade-up space-y-4">
                <div class="text-center">
                    <p class="text-xs text-gray-500 uppercase tracking-[.25em] font-bold">Daily challenge</p>
                    <h1 class="text-4xl font-black gradient-text mt-1">Reto diario</h1>
                    <p id="daily-date" class="text-gray-500 text-sm mt-1"></p>
                </div>
                <div id="daily-content" class="daily-card rounded-3xl p-5"></div>
                <div id="daily-ranking" class="glass rounded-2xl p-4"></div>
                <button type="button" id="daily-back" class="btn-ghost w-full py-3 rounded-xl">Volver</button>
            </div>
        `;
        document.body.appendChild(screen);
        $('daily-back').addEventListener('click', () => showScreen('screen-welcome'));
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
        $(id)?.classList.add('active');
    }

    async function loadDailySongs(seed = state.date) {
        const themes = Array.isArray(window.HIT_THE_YEAR_THEMES) ? window.HIT_THE_YEAR_THEMES : HIT_THE_YEAR_THEMES;
        await Promise.all(themes.map((theme) => loadScript(`data/${theme.id}.js`).catch(() => null)));
        const allSongs = themes
            .flatMap((theme) => Array.isArray(window[theme.variable]) ? window[theme.variable] : [])
            .filter((song) => song && song.title && song.artist && Number.isFinite(Number(song.year)));
        return seededShuffle(allSongs, seed).slice(0, DAILY_SONG_COUNT);
    }

    async function startDailyChallenge() {
        injectStyles();
        ensureDailyScreen();
        showScreen('screen-daily-challenge');
        $('daily-date').textContent = `Reto de ${state.date}`;
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
        const currentGuess = Math.min(2026, Math.max(1930, Number(song.year) || 1989));

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
                        ${song.preview ? '<button type="button" id="daily-play" class="btn-grad mt-3 px-4 py-2 rounded-xl text-sm">▶ Escuchar preview</button>' : '<p class="text-xs text-gray-500 mt-3">Sin preview disponible</p>'}
                    </div>
                </div>
            </div>
            <div class="space-y-3">
                <div class="text-center"><span id="daily-year-value" class="text-5xl font-black gradient-text">${currentGuess}</span></div>
                <input id="daily-year-range" type="range" min="1930" max="2026" value="${currentGuess}" class="range-styled">
                <div class="flex justify-between text-xs text-gray-600"><span>1930</span><span>2026</span></div>
                <button type="button" id="daily-answer" class="btn-grad w-full py-3 rounded-xl">Confirmar año</button>
            </div>
        `;

        $('daily-year-range').addEventListener('input', (event) => {
            $('daily-year-value').textContent = event.target.value;
        });
        $('daily-answer').addEventListener('click', submitDailyAnswer);
        $('daily-play')?.addEventListener('click', () => toggleAudio(song.preview));
    }

    function submitDailyAnswer() {
        const song = state.songs[state.currentIndex];
        const guess = Number($('daily-year-range')?.value);
        const elapsedSeconds = Math.round((Date.now() - state.startedAt) / 1000);
        const points = calcPoints(guess, Number(song.year), elapsedSeconds);
        const answer = {
            title: song.title,
            artist: song.artist,
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
            finishDailyChallenge();
        } else {
            renderDailyReveal(answer);
        }
    }

    function renderDailyReveal(answer) {
        $('daily-content').innerHTML = `
            <div class="text-center space-y-4">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Resultado</p>
                <div>
                    <p class="text-xl font-black text-white">${escapeHtml(answer.title)}</p>
                    <p class="text-gray-400 text-sm">${escapeHtml(answer.artist)}</p>
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

    function finishDailyChallenge() {
        const score = state.answers.reduce((total, answer) => total + answer.points, 0);
        const exact = state.answers.filter((answer) => answer.diff === 0).length;
        const result = {
            date: state.date,
            name: getPlayerName(),
            score,
            exact,
            total: state.answers.length,
            answers: state.answers,
            finished: true,
            finishedAt: new Date().toISOString(),
        };
        savePlayerName(result.name);
        writeJson(resultKey(), result);
        saveRankingResult(result);
        state.finished = true;
        window.showRoundEvent?.(`🏆 Reto diario completado: ${score} puntos`, 'leader');
        window.confetti?.(48);
        renderSummary(result);
        renderRanking();
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

        $('daily-content').innerHTML = `
            <div class="text-center mb-5">
                <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">Resultado de hoy</p>
                <p class="text-6xl font-black gradient-text mt-1">${result.score}</p>
                <p class="text-gray-400 text-sm">${result.exact}/${result.total} años exactos</p>
            </div>
            <div class="glass rounded-2xl p-4 mb-4 max-h-64 overflow-auto">${rows}</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" id="daily-share" class="btn-grad py-3 rounded-xl">Compartir resultado</button>
                <button type="button" id="daily-history" class="btn-ghost py-3 rounded-xl">Histórico</button>
            </div>
        `;
        $('daily-share').addEventListener('click', () => shareResult(result));
        $('daily-history').addEventListener('click', renderHistory);
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
        const text = `He hecho ${result.score} puntos en el reto diario de HitYear (${result.exact}/${result.total} exactas) 🎵 ${location.href}`;
        if (navigator.share) {
            await navigator.share({ title: 'HitYear daily challenge', text }).catch(() => null);
            return;
        }
        await navigator.clipboard?.writeText(text).catch(() => null);
        window.showRoundEvent?.('📋 Resultado copiado', 'success');
    }

    function toggleAudio(src) {
        if (!src) return;
        if (state.audio && !state.audio.paused) {
            stopAudio();
            return;
        }
        stopAudio();
        state.audio = new Audio(src);
        state.audio.play().catch(() => window.showRoundEvent?.('No se pudo reproducir el preview', 'warning'));
    }

    function stopAudio() {
        if (!state.audio) return;
        state.audio.pause();
        state.audio.currentTime = 0;
        state.audio = null;
    }

    onReady(() => {
        injectStyles();
        ensureDailyEntryPoint();
        ensureDailyScreen();
        window.getDailyChallengeSongs = (seed = todaySeed()) => loadDailySongs(seed);
    });
}());
