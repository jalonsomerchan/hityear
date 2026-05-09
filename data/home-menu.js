/*
 * Home menu simplificado para HitYear.
 * Mantiene compatibilidad con las funciones existentes del juego y los módulos opcionales.
 */
(function initHitYearHomeMenu() {
    const $ = (id) => document.getElementById(id);
    const MENU_ID = 'hit-home-menu';

    function onReady(callback) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
        else callback();
    }

    function injectStyles() {
        if ($('hit-home-menu-styles')) return;
        const style = document.createElement('style');
        style.id = 'hit-home-menu-styles';
        style.textContent = `
            .home-menu-card {
                background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035));
                border: 1px solid rgba(255,255,255,.10);
                border-radius: 28px;
                padding: 22px;
                box-shadow: 0 24px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.08);
            }
            .home-menu-grid { display: grid; gap: 9px; }
            .home-menu-btn {
                width: 100%;
                border-radius: 18px;
                padding: 15px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                text-align: left;
                border: 1px solid rgba(255,255,255,.10);
                background: rgba(255,255,255,.055);
                color: #fff;
                transition: transform .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease;
                cursor: pointer;
            }
            .home-menu-btn:hover {
                transform: translateY(-1px);
                background: rgba(255,255,255,.095);
                border-color: rgba(255,255,255,.18);
                box-shadow: 0 10px 28px rgba(0,0,0,.20);
            }
            .home-menu-btn:focus-visible {
                outline: none;
                box-shadow: 0 0 0 3px rgba(139,92,246,.28), 0 10px 28px rgba(0,0,0,.20);
            }
            .home-menu-btn-main {
                background: linear-gradient(135deg, #7C3AED, #DB2777);
                border-color: rgba(255,255,255,.16);
                box-shadow: 0 16px 38px rgba(124,58,237,.28);
            }
            .home-menu-btn-main:hover { background: linear-gradient(135deg, #8B5CF6, #EC4899); }
            .home-menu-btn-title { font-weight: 850; letter-spacing: -.01em; }
            .home-menu-btn-sub { color: rgba(255,255,255,.56); font-size: .74rem; font-weight: 650; white-space: nowrap; }
            .home-menu-btn-main .home-menu-btn-sub { color: rgba(255,255,255,.76); }
            .home-menu-arrow { opacity: .5; font-size: 1rem; line-height: 1; }
            .home-menu-input {
                width: 100%;
                background: rgba(255,255,255,.06);
                border: 1px solid rgba(255,255,255,.12);
                border-radius: 16px;
                padding: 13px 15px;
                color: #fff;
                outline: none;
                font-size: 1rem;
                transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
            }
            .home-menu-input:focus { border-color: #8B5CF6; box-shadow: 0 0 0 3px rgba(139,92,246,.18); background: rgba(255,255,255,.08); }
            .home-menu-join { display: none; gap: 10px; margin-top: 1px; padding: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 18px; background: rgba(0,0,0,.16); }
            .home-menu-join.active { display: grid; }
            .home-about-backdrop { position: fixed; inset: 0; z-index: 100; display: none; align-items: center; justify-content: center; padding: 18px; background: rgba(0,0,0,.72); backdrop-filter: blur(8px); }
            .home-about-backdrop.active { display: flex; }
            .home-about-modal { width: min(92vw, 520px); max-height: 86vh; overflow: auto; background: #101020; border: 1px solid rgba(255,255,255,.12); border-radius: 26px; padding: 22px; box-shadow: 0 24px 70px rgba(0,0,0,.5); }
            .home-about-step { padding: 13px 0; border-top: 1px solid rgba(255,255,255,.07); }
            .home-about-step:first-of-type { border-top: 0; }
            @media (max-width: 380px) {
                .home-menu-card { padding: 18px; border-radius: 24px; }
                .home-menu-btn { padding: 13px 14px; }
                .home-menu-btn-sub { display: none; }
            }
        `;
        document.head.appendChild(style);
    }

    function originalNameInput() {
        return $('inp-username');
    }

    function playerName() {
        return $('home-player-name')?.value?.trim() || originalNameInput()?.value?.trim() || 'Jugador';
    }

    function syncName() {
        const original = originalNameInput();
        if (original) original.value = playerName();
        try { localStorage.setItem('hityear:player-name', playerName()); } catch (_) { }
    }

    function setTab(tab) {
        if (typeof window.setTab === 'function') window.setTab(tab);
    }

    function enterGame() {
        syncName();
        if (typeof window.handleEnter === 'function') window.handleEnter();
    }

    function clickWhenAvailable(id, fallback, attempts = 16) {
        const button = $(id);
        if (button) {
            syncName();
            button.click();
            return;
        }
        if (attempts <= 0) {
            fallback?.();
            return;
        }
        window.setTimeout(() => clickWhenAvailable(id, fallback, attempts - 1), 160);
    }

    function openDaily() {
        clickWhenAvailable('btn-daily-challenge', () => showToast('El reto diario aún se está cargando', 'warning'));
    }

    function openSolo() {
        clickWhenAvailable('btn-solo-player', () => showToast('El modo 1 jugador aún se está cargando', 'warning'));
    }

    function createRoom() {
        syncName();
        try { localStorage.setItem('hityear:duel-mode:active', '0'); } catch (_) { }
        setTab('create');
        enterGame();
    }

    function toggleJoin() {
        const form = $('home-join-form');
        form?.classList.toggle('active');
        if (form?.classList.contains('active')) $('home-room-code')?.focus();
    }

    function joinRoom() {
        syncName();
        const code = $('home-room-code')?.value?.trim().toUpperCase();
        if (!code) {
            showToast('Introduce el código de sala', 'warning');
            return;
        }
        setTab('join');
        const originalCode = $('inp-code');
        if (originalCode) originalCode.value = code;
        enterGame();
    }

    function openDuel() {
        syncName();
        if (window.HitYearDuel?.start) {
            window.HitYearDuel.start();
            return;
        }
        clickWhenAvailable('btn-duel-mode', () => showToast('El modo 1vs1 aún se está cargando', 'warning'));
    }

    function openAbout() {
        $('home-about')?.classList.add('active');
    }

    function closeAbout() {
        $('home-about')?.classList.remove('active');
    }

    async function shareGame() {
        const text = `Juega a HitYear conmigo: ${location.href}`;
        if (navigator.share) {
            await navigator.share({ title: 'HitYear', text, url: location.href }).catch(() => null);
            return;
        }
        await navigator.clipboard?.writeText(location.href).catch(() => null);
        showToast('Enlace copiado', 'success');
    }

    function showToast(message, type = 'info') {
        if (typeof window.showRoundEvent === 'function') {
            window.showRoundEvent(message, type);
            return;
        }
        const err = $('home-menu-error') || $('welcome-err');
        if (err) {
            err.textContent = message;
            err.classList.remove('hidden');
        }
    }

    function menuButton(label, subtitle, className, id) {
        return `
            <button type="button" id="${id}" class="home-menu-btn ${className}">
                <span class="home-menu-btn-title">${label}</span>
                <span class="flex items-center gap-2">
                    <span class="home-menu-btn-sub">${subtitle}</span>
                    <span class="home-menu-arrow">›</span>
                </span>
            </button>
        `;
    }

    function ensureAboutModal() {
        if ($('home-about')) return;
        const modal = document.createElement('div');
        modal.id = 'home-about';
        modal.className = 'home-about-backdrop';
        modal.innerHTML = `
            <div class="home-about-modal">
                <div class="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <p class="text-xs text-gray-500 uppercase tracking-[.22em] font-black">Acerca de</p>
                        <h2 class="text-3xl font-black gradient-text mt-1">Cómo jugar a HitYear</h2>
                    </div>
                    <button type="button" id="home-about-close" class="btn-ghost rounded-xl px-3 py-2">Cerrar</button>
                </div>
                <div class="home-about-step">
                    <p class="text-sm text-gray-300"><strong class="text-white">Escucha el fragmento</strong> de una canción. No verás el título ni el artista hasta responder.</p>
                </div>
                <div class="home-about-step">
                    <p class="text-sm text-gray-300"><strong class="text-white">Adivina el año</strong> moviendo el selector y confirma tu respuesta antes de que acabe el tiempo.</p>
                </div>
                <div class="home-about-step">
                    <p class="text-sm text-gray-300"><strong class="text-white">Puntúas por precisión y rapidez:</strong> año exacto da la máxima puntuación y el bonus de velocidad premia responder pronto.</p>
                </div>
                <div class="home-about-step">
                    <p class="text-sm text-gray-300"><strong class="text-white">Reto diario:</strong> todos juegan la misma lista cada día. Perfecto para comparar resultados.</p>
                </div>
                <div class="home-about-step">
                    <p class="text-sm text-gray-300"><strong class="text-white">Crear sala o unirte:</strong> juega con amigos usando un código de sala en tiempo real.</p>
                </div>
                <div class="home-about-step">
                    <p class="text-sm text-gray-300"><strong class="text-white">1vs1:</strong> duelo rápido para dos jugadores, con marcador claro y máxima competitividad.</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        $('home-about-close')?.addEventListener('click', closeAbout);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeAbout();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeAbout();
        });
    }

    function installMenu() {
        const card = $('screen-welcome')?.querySelector('.glass.rounded-2xl');
        if (!card || $(MENU_ID)) return;

        const originalName = originalNameInput()?.value || localStorage.getItem('hityear:player-name') || '';
        Array.from(card.children).forEach((child) => {
            child.classList.add('hidden');
        });

        const menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.className = 'home-menu-card space-y-4';
        menu.innerHTML = `
            <div>
                <label class="block text-xs text-gray-400 mb-1.5">Nombre del jugador</label>
                <input id="home-player-name" type="text" maxlength="20" placeholder="MusicMaster99" value="${escapeHtml(originalName)}" class="home-menu-input" />
            </div>
            <div class="home-menu-grid">
                ${menuButton('Reto diario', 'misma lista para todos', 'home-menu-btn-main', 'home-open-daily')}
                ${menuButton('1 jugador', 'partida rápida', 'home-menu-btn-ghost', 'home-open-solo')}
                ${menuButton('Crear sala', 'multijugador', 'home-menu-btn-ghost', 'home-create-room')}
                ${menuButton('Unirme a sala', 'con código', 'home-menu-btn-ghost', 'home-toggle-join')}
                <div id="home-join-form" class="home-menu-join">
                    <input id="home-room-code" type="text" maxlength="8" placeholder="Código de sala" class="home-menu-input text-center uppercase font-mono tracking-widest" />
                    <button type="button" id="home-join-room" class="btn-grad w-full py-3 rounded-xl">Entrar en la sala</button>
                </div>
                ${menuButton('1vs1', 'duelo competitivo', 'home-menu-btn-ghost', 'home-open-duel')}
                ${menuButton('Acerca de', 'cómo jugar', 'home-menu-btn-ghost', 'home-open-about')}
                ${menuButton('Compartir juego', 'copiar enlace', 'home-menu-btn-ghost', 'home-share-game')}
            </div>
            <p id="home-menu-error" class="text-red-400 text-xs text-center hidden"></p>
        `;
        card.appendChild(menu);

        $('home-player-name')?.addEventListener('input', syncName);
        $('home-open-daily')?.addEventListener('click', openDaily);
        $('home-open-solo')?.addEventListener('click', openSolo);
        $('home-create-room')?.addEventListener('click', createRoom);
        $('home-toggle-join')?.addEventListener('click', toggleJoin);
        $('home-join-room')?.addEventListener('click', joinRoom);
        $('home-room-code')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') joinRoom();
        });
        $('home-open-duel')?.addEventListener('click', openDuel);
        $('home-open-about')?.addEventListener('click', openAbout);
        $('home-share-game')?.addEventListener('click', shareGame);
        syncName();
    }

    function hideDuplicatedInjectedButtons() {
        ['btn-daily-challenge', 'btn-solo-player', 'btn-duel-mode'].forEach((id) => {
            const button = $(id);
            if (button && !button.dataset.homeMenuHidden) {
                button.dataset.homeMenuHidden = '1';
                button.classList.add('hidden');
            }
        });
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    onReady(() => {
        injectStyles();
        ensureAboutModal();
        installMenu();
        hideDuplicatedInjectedButtons();
        const observer = new MutationObserver(() => {
            installMenu();
            hideDuplicatedInjectedButtons();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.HitYearHomeMenu = { openAbout, shareGame };
    });
}());
