/*
 * HitYear Duel Mode
 * Modo competitivo 1vs1 en tiempo real sobre las salas WebSocket existentes.
 *
 * Importante: este módulo no debe forzar configuración en bucle. El anfitrión emite cambios
 * de sala al tocar configuración, así que todo aquí es idempotente y cacheado.
 */
(function initHitYearDuelMode() {
    const DUEL_STORAGE = 'hityear:duel-mode:active';
    const DUEL_ROUNDS = 10;
    const DUEL_SECONDS = 15;
    const $ = (id) => document.getElementById(id);
    const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

    const state = {
        active: localStorage.getItem(DUEL_STORAGE) === '1',
        patchedStart: false,
        patchedPlayAgain: false,
        lastScreen: '',
        lastRoundSignature: '',
        lastLobbySignature: '',
        lastLobbyStatus: '',
        lobbyConfigured: false,
        tickScheduled: false,
    };

    function onReady(callback) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
        else callback();
    }

    function showToast(message, type = 'info') {
        if (typeof window.showRoundEvent === 'function') {
            window.showRoundEvent(message, type);
            return;
        }
        const err = $('welcome-err');
        if (err) {
            err.textContent = message;
            err.classList.remove('hidden');
        }
    }

    function setDuelActive(active) {
        const nextActive = Boolean(active);
        if (state.active === nextActive) return;
        state.active = nextActive;
        state.lobbyConfigured = false;
        state.lastLobbySignature = '';
        state.lastLobbyStatus = '';
        localStorage.setItem(DUEL_STORAGE, state.active ? '1' : '0');
        document.documentElement.classList.toggle('duel-active', state.active);
    }

    function activeScreenId() {
        return document.querySelector('.screen.active')?.id || '';
    }

    function injectStyles() {
        if ($('duel-mode-styles')) return;
        const style = document.createElement('style');
        style.id = 'duel-mode-styles';
        style.textContent = `
            .duel-card { background: linear-gradient(135deg, rgba(245, 158, 11, .16), rgba(236, 72, 153, .14)); border: 1px solid rgba(245, 158, 11, .22); box-shadow: 0 18px 48px rgba(0,0,0,.28); }
            .duel-chip { display: inline-flex; align-items: center; gap: .35rem; padding: .35rem .55rem; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.1); font-size: .72rem; color: #d1d5db; }
            .duel-leader { outline: 1px solid rgba(245, 158, 11, .35); box-shadow: 0 0 0 4px rgba(245, 158, 11, .08); }
            .duel-locked #host-actions button { opacity: .45; }
        `;
        document.head.appendChild(style);
    }

    function ensureWelcomeButton() {
        const welcomeCard = $('screen-welcome')?.querySelector('.glass.rounded-2xl');
        if (!welcomeCard || $('btn-duel-mode')) return;

        const button = document.createElement('button');
        button.id = 'btn-duel-mode';
        button.type = 'button';
        button.className = 'btn-ghost w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2';
        button.innerHTML = '<span>⚔️</span><span>Duelo 1vs1</span><span class="text-gray-400 font-normal">tiempo real</span>';
        button.addEventListener('click', startDuelFlow);
        welcomeCard.appendChild(button);
    }

    function startDuelFlow() {
        setDuelActive(true);
        if (!$('inp-username')?.value?.trim()) {
            $('inp-username').value = `Duelista${Math.floor(Math.random() * 90) + 10}`;
        }
        if (typeof window.setTab === 'function') window.setTab('create');
        if (typeof window.handleEnter === 'function') {
            window.handleEnter();
            window.setTimeout(scheduleTick, 250);
            window.setTimeout(scheduleTick, 900);
            return;
        }
        showToast('No se pudo iniciar el duelo todavía', 'warning');
    }

    function playerRows() {
        return Array.from($('lobby-players')?.children || []).filter((node) => textOf(node));
    }

    function playerCount() {
        return playerRows().length;
    }

    function setValueIfNeeded(input, value) {
        if (!input || input.value === String(value)) return false;
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function setTextIfNeeded(node, value) {
        if (!node || node.textContent === String(value)) return false;
        node.textContent = String(value);
        return true;
    }

    function configureDuelLobbyOnce() {
        if (!state.active || activeScreenId() !== 'screen-lobby' || state.lobbyConfigured) return;

        setValueIfNeeded($('cfg-rounds'), DUEL_ROUNDS);
        setTextIfNeeded($('val-rounds'), DUEL_ROUNDS);
        setValueIfNeeded($('cfg-time'), DUEL_SECONDS);
        setTextIfNeeded($('val-time'), `${DUEL_SECONDS}s`);

        // Solo una vez. setAudioMode puede emitir cambios por WebSocket; no debe ejecutarse en cada tick.
        if (typeof window.setAudioMode === 'function') window.setAudioMode('all');
        state.lobbyConfigured = true;
    }

    function applyLobbyDuelMode() {
        if (!state.active || activeScreenId() !== 'screen-lobby') return;
        configureDuelLobbyOnce();
        ensureLobbyPanel();
        updateLobbyLock();
    }

    function ensureLobbyPanel() {
        const lobbyPlayers = $('lobby-players');
        if (!lobbyPlayers || $('duel-lobby-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'duel-lobby-panel';
        panel.className = 'duel-card rounded-2xl p-4 mb-4 space-y-3';
        panel.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-xs text-amber-200 font-black uppercase tracking-wider">Modo duelo 1vs1</p>
                    <p class="text-sm text-gray-300 mt-1">Dos jugadores, ${DUEL_ROUNDS} canciones, ${DUEL_SECONDS}s por ronda y marcador en directo.</p>
                </div>
                <button type="button" id="duel-cancel" class="btn-ghost px-3 py-1.5 rounded-lg text-xs">Salir</button>
            </div>
            <div class="flex flex-wrap gap-2">
                <span class="duel-chip">⚡ bonus de rapidez</span>
                <span class="duel-chip">🔥 combo visual</span>
                <span class="duel-chip">☠️ muerte súbita si empatan</span>
            </div>
            <p id="duel-lobby-status" class="text-xs text-gray-500"></p>
        `;
        const playersCard = lobbyPlayers.closest('.glass.rounded-2xl');
        playersCard?.insertAdjacentElement('afterend', panel);
        $('duel-cancel')?.addEventListener('click', () => {
            setDuelActive(false);
            panel.remove();
            document.body.classList.remove('duel-locked');
            const startButton = $('host-actions')?.querySelector('button');
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = '🎮 Iniciar partida';
            }
            showToast('Duelo desactivado', 'info');
        });
    }

    function updateLobbyLock() {
        if (!state.active || activeScreenId() !== 'screen-lobby') return;

        const count = playerCount();
        const ready = count === 2;
        const signature = `${count}|${ready}|${textOf($('lobby-players'))}`;
        if (signature === state.lastLobbySignature) return;
        state.lastLobbySignature = signature;

        document.body.classList.toggle('duel-locked', !ready);

        const status = $('duel-lobby-status');
        const statusText = ready
            ? 'Listo: ya sois 2 jugadores. El anfitrión puede iniciar el duelo.'
            : count < 2
                ? `Esperando rival: ${count}/2 jugadores conectados.`
                : `Hay ${count} jugadores. El duelo solo admite 2; deja solo a dos jugadores.`;
        if (status && statusText !== state.lastLobbyStatus) {
            state.lastLobbyStatus = statusText;
            status.textContent = statusText;
            status.className = ready ? 'text-xs text-emerald-300' : 'text-xs text-amber-200';
        }

        const startButton = $('host-actions')?.querySelector('button');
        if (startButton) {
            const nextText = ready ? '⚔️ Iniciar duelo 1vs1' : '⚔️ Esperando 2 jugadores';
            if (startButton.textContent !== nextText) startButton.textContent = nextText;
            if (startButton.disabled === ready) startButton.disabled = !ready;
        }
    }

    function patchStartGame() {
        if (state.patchedStart || typeof window.startGame !== 'function') return;
        const original = window.startGame;
        window.startGame = function duelStartGameWrapper(...args) {
            if (state.active) {
                configureDuelLobbyOnce();
                const count = playerCount();
                if (count !== 2) {
                    showToast('El duelo 1vs1 necesita exactamente 2 jugadores', 'warning');
                    updateLobbyLock();
                    return;
                }
                showToast('⚔️ Duelo iniciado: rapidez + precisión', 'leader');
            }
            return original.apply(this, args);
        };
        state.patchedStart = true;
    }

    function patchPlayAgain() {
        if (state.patchedPlayAgain || typeof window.playAgain !== 'function') return;
        const original = window.playAgain;
        window.playAgain = function duelPlayAgainWrapper(...args) {
            const result = original.apply(this, args);
            if (state.active) {
                state.lobbyConfigured = false;
                state.lastLobbySignature = '';
                window.setTimeout(scheduleTick, 300);
            }
            return result;
        };
        state.patchedPlayAgain = true;
    }

    function parseScore(text) {
        const matches = String(text || '').match(/\d+/g);
        return matches?.length ? Number(matches[matches.length - 1]) : 0;
    }

    function parseName(text) {
        return String(text || '')
            .replace(/^[#🥇🥈🥉🏆⚔️\s\d.\-]+/, '')
            .replace(/\d+\s*(pts?|puntos?)?.*$/i, '')
            .trim() || 'Jugador';
    }

    function boardFrom(containerId) {
        return Array.from($(containerId)?.children || [])
            .map((row) => ({ row, text: textOf(row), score: parseScore(textOf(row)), name: parseName(textOf(row)) }))
            .filter((entry) => entry.text);
    }

    function ensurePlayingBanner() {
        if (!state.active || activeScreenId() !== 'screen-playing' || $('duel-playing-banner')) return;
        const topBar = $('screen-playing')?.querySelector('.glass');
        const banner = document.createElement('div');
        banner.id = 'duel-playing-banner';
        banner.className = 'duel-card mx-4 mt-3 rounded-2xl px-4 py-3 text-sm';
        banner.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <span class="font-black text-amber-200">⚔️ Duelo 1vs1</span>
                <span class="text-xs text-gray-400">${DUEL_ROUNDS} canciones · ${DUEL_SECONDS}s</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">Responde antes que tu rival y clava el año para abrir distancia.</p>
        `;
        topBar?.insertAdjacentElement('afterend', banner);
    }

    function ensureRoundDuelPanel() {
        if (!state.active || activeScreenId() !== 'screen-round-result') return;
        const signature = `${textOf($('rr-board'))}|${textOf($('rr-answers'))}|${textOf($('rr-year'))}`;
        if (!signature || signature === state.lastRoundSignature) return;
        state.lastRoundSignature = signature;

        const board = boardFrom('rr-board');
        if (!board.length) return;
        const leader = board[0];
        board.forEach((entry, index) => entry.row.classList.toggle('duel-leader', index === 0));

        let panel = $('duel-round-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'duel-round-panel';
            panel.className = 'duel-card rounded-2xl p-4';
            $('rr-board')?.closest('.glass.rounded-2xl')?.insertAdjacentElement('afterend', panel);
        }
        const gap = board.length > 1 ? Math.abs(board[0].score - board[1].score) : 0;
        panel.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <div>
                    <p class="text-xs text-amber-200 font-black uppercase tracking-wider">Marcador del duelo</p>
                    <p class="text-sm text-gray-300 mt-1"><strong class="text-white">${escapeHtml(leader.name)}</strong> va ganando por ${gap} puntos.</p>
                </div>
                <div class="text-3xl">⚔️</div>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-3">
                ${board.slice(0, 2).map((entry, index) => `
                    <div class="glass rounded-xl p-3 text-center ${index === 0 ? 'duel-leader' : ''}">
                        <p class="text-xs text-gray-500 truncate">${index === 0 ? 'Líder' : 'Rival'}</p>
                        <p class="font-black truncate">${escapeHtml(entry.name)}</p>
                        <p class="text-2xl font-black gradient-text">${entry.score}</p>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function ensureGameOverDuelPanel() {
        if (!state.active || activeScreenId() !== 'screen-game-over' || $('duel-gameover-panel')) return;
        const board = boardFrom('go-board');
        if (!board.length) return;

        const tied = board.length > 1 && board[0].score === board[1].score;
        const panel = document.createElement('div');
        panel.id = 'duel-gameover-panel';
        panel.className = 'duel-card rounded-2xl p-4 text-center space-y-3';
        panel.innerHTML = tied ? `
            <div class="text-4xl">☠️</div>
            <div>
                <p class="font-black text-amber-200">¡Empate! Muerte súbita</p>
                <p class="text-sm text-gray-400 mt-1">Jugad una revancha rápida para desempatar.</p>
            </div>
        ` : `
            <div class="text-4xl">⚔️</div>
            <div>
                <p class="font-black text-amber-200">Ganador del duelo</p>
                <p class="text-2xl font-black gradient-text mt-1">${escapeHtml(board[0].name)}</p>
                <p class="text-sm text-gray-400">Victoria por ${board.length > 1 ? Math.abs(board[0].score - board[1].score) : board[0].score} puntos</p>
            </div>
            <button type="button" id="duel-share" class="btn-ghost w-full py-3 rounded-xl">Compartir duelo</button>
        `;
        $('go-board')?.closest('.glass.rounded-2xl')?.insertAdjacentElement('afterend', panel);
        $('duel-share')?.addEventListener('click', () => shareDuelResult(board));
    }

    async function shareDuelResult(board) {
        const text = board.length > 1
            ? `⚔️ Duelo HitYear: ${board[0].name} ganó ${board[0].score}-${board[1].score} a ${board[1].name}. ${location.href}`
            : `⚔️ Duelo HitYear completado. ${location.href}`;
        if (navigator.share) {
            await navigator.share({ title: 'HitYear duelo 1vs1', text }).catch(() => null);
            return;
        }
        await navigator.clipboard?.writeText(text).catch(() => null);
        showToast('📋 Resultado del duelo copiado', 'success');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function tick() {
        state.tickScheduled = false;
        patchStartGame();
        patchPlayAgain();
        ensureWelcomeButton();

        const screen = activeScreenId();
        if (screen !== state.lastScreen) {
            state.lastScreen = screen;
            state.lastRoundSignature = '';
            if (screen === 'screen-lobby') {
                state.lobbyConfigured = false;
                state.lastLobbySignature = '';
            }
        }

        if (!state.active) return;
        if (screen === 'screen-lobby') applyLobbyDuelMode();
        if (screen === 'screen-playing') ensurePlayingBanner();
        if (screen === 'screen-round-result') ensureRoundDuelPanel();
        if (screen === 'screen-game-over') ensureGameOverDuelPanel();
    }

    function scheduleTick() {
        if (state.tickScheduled) return;
        state.tickScheduled = true;
        window.requestAnimationFrame(tick);
    }

    onReady(() => {
        injectStyles();
        ensureWelcomeButton();
        document.documentElement.classList.toggle('duel-active', state.active);
        const observer = new MutationObserver(scheduleTick);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        window.setInterval(scheduleTick, 1200);
        window.HitYearDuel = {
            start: startDuelFlow,
            activate: () => setDuelActive(true),
            deactivate: () => setDuelActive(false),
        };
    });
}());
