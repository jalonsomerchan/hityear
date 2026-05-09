/**
 * Configuración de temas para Hit The Year
 * Para añadir un nuevo tema:
 * 1. Crea el fichero JS en hit_the_year/data/ con la estructura de canciones.
 * 2. Añade un objeto aquí con:
 *    - id: nombre del fichero JS (sin .js)
 *    - label: nombre que aparecerá en el desplegable
 *    - variable: nombre de la constante/variable definida dentro del fichero JS
 */
const HIT_THE_YEAR_THEMES = [
    { id: 'hitsterSpain', label: 'Hitster Spain', variable: 'hitsterSpain' },
    { id: 'popEspanolHoyYSiempre', label: 'Pop Español Hoy y Siempre', variable: 'popEspanolHoyYSiempre' },
    { id: 'espana80y90', label: 'España 80 y 90', variable: 'espana80y90' },
    { id: 'bestHits', label: 'Best Hits', variable: 'bestHits' },
    { id: 'soloRegguetton', label: 'Solo Regguetton', variable: 'soloRegguetton' },

];

window.HIT_THE_YEAR_THEMES = HIT_THE_YEAR_THEMES;

(function loadHitYearOptionalModules() {
    ['data/daily-challenge.js', 'data/daily-solo-fix.js', 'data/solo-daily-autoplay.js', 'data/duel-mode.js'].forEach((src) => {
        if (document.querySelector(`script[src="${src}"]`)) return;

        const script = document.createElement('script');
        script.src = src;
        script.defer = true;
        script.onerror = () => console.warn(`No se pudo cargar ${src}`);
        document.head.appendChild(script);
    });
}());

/**
 * Party mode
 * Feedback visual no bloqueante para partidas en grupo.
 */
(function initHitYearPartyMode() {
    const partyState = {
        lastLeader: '',
        lastRoundSignature: '',
        lastAllAnsweredSignature: '',
        lowTimerActive: false,
        submitPatched: false,
    };

    const $ = (id) => document.getElementById(id);
    const textOf = (element) => (element?.textContent || '').replace(/\s+/g, ' ').trim();
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    function onReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    function activeScreenId() {
        return document.querySelector('.screen.active')?.id || '';
    }

    function injectStyles() {
        if ($('party-mode-styles')) return;
        const style = document.createElement('style');
        style.id = 'party-mode-styles';
        style.textContent = `
            #party-toast-zone { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 50%; z-index: 80; width: min(92vw, 430px); pointer-events: none; transform: translateX(-50%); }
            .party-toast { display: flex; align-items: center; justify-content: center; gap: .5rem; margin-bottom: .55rem; padding: .8rem 1rem; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; color: #fff; font-weight: 900; text-align: center; background: linear-gradient(135deg, rgba(139,92,246,.94), rgba(236,72,153,.94)); box-shadow: 0 18px 48px rgba(0,0,0,.38), 0 0 32px rgba(236,72,153,.24); animation: partyToastIn .28s ease-out, partyToastOut .24s ease-in 2.75s forwards; }
            .party-toast.success { background: linear-gradient(135deg, rgba(16,185,129,.95), rgba(139,92,246,.95)); }
            .party-toast.warning { background: linear-gradient(135deg, rgba(245,158,11,.96), rgba(236,72,153,.95)); }
            .party-toast.danger { background: linear-gradient(135deg, rgba(239,68,68,.96), rgba(236,72,153,.95)); }
            .party-toast.leader { background: linear-gradient(135deg, rgba(250,204,21,.96), rgba(236,72,153,.95)); color: #160816; }
            @keyframes partyToastIn { from { opacity: 0; transform: translateY(-12px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @keyframes partyToastOut { to { opacity: 0; transform: translateY(-10px) scale(.98); } }
            .party-pulse-once { animation: partyPulseOnce .55s ease-out; }
            @keyframes partyPulseOnce { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236,72,153,.45); } 45% { transform: scale(1.035); box-shadow: 0 0 0 12px rgba(236,72,153,0); } 100% { transform: scale(1); box-shadow: none; } }
            .party-timer-low { animation: partyTimerShake .34s ease-in-out infinite; }
            @keyframes partyTimerShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
            #party-confetti-layer { position: fixed; inset: 0; z-index: 70; pointer-events: none; overflow: hidden; }
            .party-confetti-piece { position: absolute; top: -14px; width: 8px; height: 14px; border-radius: 3px; opacity: .95; animation: partyConfettiFall var(--fall-duration, 1100ms) ease-out forwards; }
            @keyframes partyConfettiFall { to { opacity: 0; transform: translate3d(var(--fall-x, 0), 105vh, 0) rotate(var(--fall-rotate, 360deg)); } }
            @media (prefers-reduced-motion: reduce) { .party-toast, .party-pulse-once, .party-timer-low, .party-confetti-piece { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
        `;
        document.head.appendChild(style);
    }

    function ensureLayers() {
        if (!$('party-toast-zone')) {
            const zone = document.createElement('div');
            zone.id = 'party-toast-zone';
            zone.setAttribute('aria-live', 'polite');
            document.body.appendChild(zone);
        }
        if (!$('party-confetti-layer')) {
            const layer = document.createElement('div');
            layer.id = 'party-confetti-layer';
            layer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(layer);
        }
    }

    function showRoundEvent(message, type = 'info') {
        ensureLayers();
        if (!message) return;
        const toast = document.createElement('div');
        toast.className = `party-toast ${type}`;
        toast.textContent = message;
        $('party-toast-zone')?.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    function pulseElement(element) {
        if (!element || reducedMotion()) return;
        element.classList.remove('party-pulse-once');
        void element.offsetWidth;
        element.classList.add('party-pulse-once');
        window.setTimeout(() => element.classList.remove('party-pulse-once'), 650);
    }

    function confetti(amount = 42) {
        ensureLayers();
        if (reducedMotion()) return;
        const layer = $('party-confetti-layer');
        const colors = ['#8B5CF6', '#EC4899', '#FACC15', '#22C55E', '#38BDF8', '#F97316'];
        for (let i = 0; i < Math.min(Math.max(amount, 18), 64); i += 1) {
            const piece = document.createElement('span');
            piece.className = 'party-confetti-piece';
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.background = colors[i % colors.length];
            piece.style.setProperty('--fall-x', `${(Math.random() - .5) * 220}px`);
            piece.style.setProperty('--fall-rotate', `${180 + Math.random() * 720}deg`);
            piece.style.setProperty('--fall-duration', `${900 + Math.random() * 900}ms`);
            layer?.appendChild(piece);
            window.setTimeout(() => piece.remove(), 1900);
        }
    }

    function parseScore(rowText) {
        const matches = rowText.match(/\d+/g);
        return matches?.length ? Number(matches[matches.length - 1]) : null;
    }

    function parseLeaderName(rowText) {
        return rowText.replace(/^[#🥇🥈🥉🏆\s\d.\-]+/, '').replace(/\d+\s*(pts?|puntos?)?.*$/i, '').trim().slice(0, 28);
    }

    function announceRoundResult() {
        if (activeScreenId() !== 'screen-round-result') return;
        const signature = [textOf($('p-round')), textOf($('rr-year')), textOf($('rr-answers')), textOf($('rr-board'))].join('|');
        if (!signature || signature === partyState.lastRoundSignature) return;
        partyState.lastRoundSignature = signature;

        const actualYear = textOf($('rr-year'));
        const answersText = textOf($('rr-answers'));
        const rows = Array.from($('rr-board')?.children || []).filter((row) => textOf(row));
        if (actualYear && answersText.includes(actualYear)) {
            showRoundEvent(`🎯 ¡Año exacto! ${actualYear}`, 'success');
            confetti(46);
        } else if (rows.length) {
            showRoundEvent('📊 Ronda cerrada: mira la clasificación', 'info');
        }

        const scoredRows = rows.map((row) => ({ row, text: textOf(row), score: parseScore(textOf(row)) })).filter((entry) => Number.isFinite(entry.score));
        if (scoredRows.length >= 2 && scoredRows[0].score === scoredRows[1].score) {
            showRoundEvent('⚔️ ¡Empate en cabeza!', 'warning');
            pulseElement($('rr-board'));
        }
        if (scoredRows.length) {
            const leader = parseLeaderName(scoredRows[0].text);
            if (leader && partyState.lastLeader && leader !== partyState.lastLeader) {
                showRoundEvent(`👑 Nuevo líder: ${leader}`, 'leader');
                confetti(28);
                pulseElement(scoredRows[0].row);
            }
            partyState.lastLeader = leader || partyState.lastLeader;
        }
    }

    function announceAllAnswered() {
        if (activeScreenId() !== 'screen-playing') return;
        const statusBar = $('status-bar');
        const players = Array.from(statusBar?.children || []).filter((node) => textOf(node));
        if (players.length < 2) return;
        const answered = players.filter((node) => /✓|✔|respond/i.test(textOf(node))).length;
        const signature = `${textOf($('p-round'))}|${textOf(statusBar)}`;
        if (answered === players.length && signature !== partyState.lastAllAnsweredSignature) {
            partyState.lastAllAnsweredSignature = signature;
            showRoundEvent('🚀 ¡Todos han respondido!', 'success');
            pulseElement(statusBar);
        }
    }

    function monitorTimer() {
        const timer = $('t-num');
        const seconds = Number(textOf(timer));
        const timerWrap = timer?.closest('.relative');
        if (activeScreenId() === 'screen-playing' && Number.isFinite(seconds) && seconds > 0 && seconds <= 5) {
            timerWrap?.classList.add('party-timer-low');
            if (!partyState.lowTimerActive) {
                partyState.lowTimerActive = true;
                showRoundEvent('⏱️ ¡Últimos segundos!', 'danger');
            }
        } else {
            timerWrap?.classList.remove('party-timer-low');
            partyState.lowTimerActive = false;
        }
    }

    function patchSubmitAnswer() {
        if (partyState.submitPatched || typeof window.submitAnswer !== 'function') return;
        const originalSubmitAnswer = window.submitAnswer;
        window.submitAnswer = function partySubmitAnswerWrapper(...args) {
            const result = originalSubmitAnswer.apply(this, args);
            const year = $('year-range')?.value || textOf($('year-val'));
            const name = $('inp-username')?.value?.trim() || 'Jugador';
            window.setTimeout(() => {
                showRoundEvent(`⚡ ${name} ha respondido ${year}`, 'info');
                pulseElement($('answered-block'));
            }, 30);
            return result;
        };
        partyState.submitPatched = true;
    }

    function watch() {
        const observer = new MutationObserver(() => {
            patchSubmitAnswer();
            announceAllAnswered();
            announceRoundResult();
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], characterData: true });
        window.setInterval(() => {
            patchSubmitAnswer();
            monitorTimer();
            announceAllAnswered();
            announceRoundResult();
        }, 700);
    }

    onReady(() => {
        injectStyles();
        ensureLayers();
        watch();
        window.showRoundEvent = showRoundEvent;
        window.confetti = confetti;
    });
}());
