/*
 * Router ligero para HitYear.
 * Sincroniza pantallas con history.pushState y protege partidas en curso al salir.
 */
(function initHitYearRouter() {
    const ROUTE_BY_SCREEN = {
        'screen-welcome': '',
        'screen-lobby': 'sala',
        'screen-playing': 'jugando',
        'screen-round-result': 'resultado-ronda',
        'screen-game-over': 'fin',
        'screen-daily-challenge': 'reto-diario',
        'screen-solo-daily-fixed': 'jugar',
    };

    const SCREEN_BY_ROUTE = {
        '': 'screen-welcome',
        'inicio': 'screen-welcome',
        'sala': 'screen-lobby',
        'jugando': 'screen-playing',
        'resultado-ronda': 'screen-round-result',
        'fin': 'screen-game-over',
        'reto-diario': 'screen-solo-daily-fixed',
        'daily': 'screen-solo-daily-fixed',
        '1-jugador': 'screen-solo-daily-fixed',
        'jugar': 'screen-solo-daily-fixed',
        'duelo': 'screen-lobby',
    };

    const GUARDED_SCREENS = new Set([
        'screen-lobby',
        'screen-playing',
        'screen-round-result',
        'screen-game-over',
        'screen-daily-challenge',
        'screen-solo-daily-fixed',
    ]);

    const LEAVE_MESSAGE = 'Estás en una partida. Si sales ahora puedes perder el progreso. ¿Quieres salir?';
    const $ = (id) => document.getElementById(id);

    const state = {
        suppress: false,
        lastRoute: null,
        lastScreen: null,
        lastPushedAt: 0,
        initialized: false,
    };

    function onReady(callback) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
        else callback();
    }

    function basePath() {
        const path = window.location.pathname;
        if (path.endsWith('/')) return path;
        const fileIndex = path.lastIndexOf('/');
        return path.slice(0, fileIndex + 1) || '/';
    }

    function normalizeRoute(route) {
        return String(route || '').replace(/^\/+|\/+$/g, '');
    }

    function currentRouteFromUrl() {
        const base = basePath();
        let path = window.location.pathname;
        if (path.startsWith(base)) path = path.slice(base.length);
        return normalizeRoute(path);
    }

    function urlForRoute(route) {
        const cleanRoute = normalizeRoute(route);
        const base = basePath();
        return `${base}${cleanRoute}${window.location.search || ''}`;
    }

    function activeScreen() {
        return document.querySelector('.screen.active')?.id || '';
    }

    function routeForScreen(screenId) {
        if (screenId === 'screen-solo-daily-fixed') {
            const title = $('sd-title')?.textContent?.toLowerCase() || '';
            if (title.includes('reto')) return 'reto-diario';
            return '1-jugador';
        }
        return ROUTE_BY_SCREEN[screenId] ?? '';
    }

    function isGameInProgress() {
        const screen = activeScreen();
        if (!GUARDED_SCREENS.has(screen)) return false;

        if (screen === 'screen-welcome') return false;
        if (screen === 'screen-game-over') return true;
        if (screen === 'screen-lobby') return Boolean($('lobby-code')?.textContent?.trim());
        if (screen === 'screen-playing' || screen === 'screen-round-result') return true;
        if (screen === 'screen-daily-challenge' || screen === 'screen-solo-daily-fixed') return true;
        return false;
    }

    function confirmLeave() {
        if (!isGameInProgress()) return true;
        return window.confirm(LEAVE_MESSAGE);
    }

    function showScreen(screenId) {
        if (!screenId || !$(screenId)) return false;
        document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
        $(screenId).classList.add('active');
        return true;
    }

    function goHome({ replace = false } = {}) {
        state.suppress = true;
        showScreen('screen-welcome');
        state.suppress = false;
        syncRoute(replace);
    }

    function syncRoute(replace = false) {
        if (state.suppress) return;
        const screen = activeScreen();
        if (!screen) return;
        const route = routeForScreen(screen);
        const targetUrl = urlForRoute(route);
        const now = Date.now();

        if (route === state.lastRoute && screen === state.lastScreen) return;
        if (!replace && now - state.lastPushedAt < 120 && route === state.lastRoute) return;

        const payload = { hitYear: true, route, screen };
        if (replace || !state.initialized) {
            history.replaceState(payload, '', targetUrl);
        } else {
            history.pushState(payload, '', targetUrl);
        }
        state.initialized = true;
        state.lastRoute = route;
        state.lastScreen = screen;
        state.lastPushedAt = now;
    }

    function handlePopState() {
        const route = currentRouteFromUrl();
        const nextScreen = SCREEN_BY_ROUTE[route] || 'screen-welcome';
        const current = activeScreen();

        if (current && current !== nextScreen && isGameInProgress() && !window.confirm(LEAVE_MESSAGE)) {
            syncRoute(false);
            return;
        }

        state.suppress = true;
        if (nextScreen === 'screen-solo-daily-fixed') {
            // Si la pantalla existe, solo volvemos a ella. El estado interno lo gestionan sus módulos.
            showScreen(nextScreen);
        } else {
            showScreen(nextScreen);
        }
        state.suppress = false;
        state.lastRoute = route;
        state.lastScreen = nextScreen;
    }

    function patchHomeActionsForRoutes() {
        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;

            if (target.closest('#home-open-daily, #btn-daily-challenge')) {
                window.setTimeout(() => syncRoute(false), 250);
                window.setTimeout(() => syncRoute(false), 900);
            }
            if (target.closest('#home-open-solo, #btn-solo-player')) {
                window.setTimeout(() => syncRoute(false), 250);
                window.setTimeout(() => syncRoute(false), 900);
            }
            if (target.closest('#home-create-room')) {
                window.setTimeout(() => syncRoute(false), 350);
                window.setTimeout(() => syncRoute(false), 1200);
            }
            if (target.closest('#home-join-room')) {
                window.setTimeout(() => syncRoute(false), 350);
                window.setTimeout(() => syncRoute(false), 1200);
            }
            if (target.closest('#home-open-duel, #btn-duel-mode')) {
                window.setTimeout(() => {
                    const url = urlForRoute('duelo');
                    history.pushState({ hitYear: true, route: 'duelo', screen: activeScreen() }, '', url);
                    state.lastRoute = 'duelo';
                    state.lastScreen = activeScreen();
                }, 350);
                window.setTimeout(() => syncRoute(false), 1400);
            }
            if (target.closest('#daily-back, #sd-back')) {
                if (confirmLeave()) window.setTimeout(() => goHome(), 80);
            }
        }, true);
    }

    function installLeaveWarning() {
        window.addEventListener('beforeunload', (event) => {
            if (!isGameInProgress()) return;
            event.preventDefault();
            event.returnValue = LEAVE_MESSAGE;
            return LEAVE_MESSAGE;
        });
    }

    function installObserver() {
        const observer = new MutationObserver(() => {
            const screen = activeScreen();
            if (!screen || screen === state.lastScreen) return;
            window.requestAnimationFrame(() => syncRoute(false));
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    }

    function bootFromUrl() {
        const route = currentRouteFromUrl();
        const screen = SCREEN_BY_ROUTE[route] || 'screen-welcome';
        if (screen !== activeScreen() && $(screen)) {
            state.suppress = true;
            showScreen(screen);
            state.suppress = false;
        }
        syncRoute(true);
    }

    onReady(() => {
        bootFromUrl();
        installObserver();
        installLeaveWarning();
        patchHomeActionsForRoutes();
        window.addEventListener('popstate', handlePopState);
        window.HitYearRouter = {
            sync: syncRoute,
            goHome,
            isGameInProgress,
        };
    });
}());
