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
    { id: 'soloRegguetton', label: 'Solo Reggaetton', variable: 'soloRegguetton' },

];

/**
 * Party mode
 * Feedback visual no bloqueante para partidas en grupo.
 * Se engancha a la UI existente sin tocar la lógica de juego ni ralentizar móviles antiguos.
 */
(function initHitYearPartyMode() {
    const partyState = {
        lastLeader: null,
        lastRoundSignature: '',
        lastAllAnsweredSignature: '',
        lowTimerActive: false,
        submitPatched: false,
        fallbackSubmitBound: false,
    };

    const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const $ = (id) => document.getElementById(id);

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

    function injectPartyStyles() {
        if ($('party-mode-styles')) return;

        const style = document.createElement('style');
        style.id = 'party-mode-styles';
        style.textContent = `
            #party-toast-zone {
                position: fixed;
                top: calc(env(safe-area-inset-top, 0px) + 14px);
                left: 50%;
                z-index: 80;
                width: min(92vw, 430px);
                pointer-events: none;
                transform: translateX(-50%);
            }

            .party-toast {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: .5rem;
                margin-bottom: .55rem;
                padding: .8rem 1rem;
                border: 1px solid rgba(255, 255, 255, .16);
                border-radius: 999px;
                color: white;
                font-weight: 900;
                text-align: center;
                letter-spacing: -.01em;
                background: linear-gradient(135deg, rgba(139, 92, 246, .94), rgba(236, 72, 153, .94));
                box-shadow: 0 18px 48px rgba(0, 0, 0, .38), 0 0 32px rgba(236, 72, 153, .24);
                animation: partyToastIn .28s ease-out, partyToastOut .24s ease-in 2.75s forwards;
                will-change: transform, opacity;
            }

            .party-toast.success { background: linear-gradient(135deg, rgba(16, 185, 129, .95), rgba(139, 92, 246, .95)); }
            .party-toast.warning { background: linear-gradient(135deg, rgba(245, 158, 11, .96), rgba(236, 72, 153, .95)); }
            .party-toast.danger  { background: linear-gradient(135deg, rgba(239, 68, 68, .96), rgba(236, 72, 153, .95)); }
            .party-toast.leader  { background: linear-gradient(135deg, rgba(250, 204, 21, .96), rgba(236, 72, 153, .95)); color: #160816; }

            @keyframes partyToastIn {
                from { opacity: 0; transform: translateY(-12px) scale(.96); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }

            @keyframes partyToastOut {
                to { opacity: 0; transform: translateY(-10px) scale(.98); }
            }

            .party-pulse-once { animation: partyPulseOnce .55s ease-out; }
            @keyframes partyPulseOnce {
                0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(236, 72, 153, .45); }
                45% { transform: scale(1.035); box-shadow: 0 0 0 12px rgba(236, 72, 153, 0); }
                100% { transform: scale(1); box-shadow: none; }
            }

            .party-timer-low { animation: partyTimerShake .34s ease-in-out infinite; }
            @keyframes partyTimerShake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-2px); }
                75% { transform: translateX(2px); }
            }

            #party-confetti-layer {
                position: fixed;
                inset: 0;
                z-index: 70;
                pointer-events: none;
                overflow: hidden;
            }

            .party-confetti-piece {
                position: absolute;
                top: -14px;
                width: 8px;
                height: 14px;
                border-radius: 3px;
                opacity: .95;
                animation: partyConfettiFall var(--fall-duration, 1100ms) ease-out forwards;
                transform: translate3d(0, 0, 0) rotate(0deg);
            }

            @keyframes partyConfettiFall {
                to {
                    opacity: 0;
                    transform: translate3d(var(--fall-x, 0), 105vh, 0) rotate(var(--fall-rotate, 360deg));
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .party-toast,
                .party-pulse-once,
                .party-timer-low,
                .party-confetti-piece {
                    animation-duration: .01ms !important;
                    animation-iteration-count: 1 !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureLayers() {
        if (!$('party-toast-zone')) {
            const toastZone = document.createElement('div');
            toastZone.id = 'party-toast-zone';
            toastZone.setAttribute('aria-live', 'polite');
            toastZone.setAttribute('aria-atomic', 'false');
            document.body.appendChild(toastZone);
        }

        if (!$('party-confetti-layer')) {
            const confettiLayer = document.createElement('div');
            confettiLayer.id = 'party-confetti-layer';
            confettiLayer.setAttribute('aria-hidden', 'true');
            document.body.appendChild(confettiLayer);
        }
    }

    function showRoundEvent(message, type = 'info') {
        ensureLayers();
        const zone = $('party-toast-zone');
        if (!zone || !message) return;

        const toast = document.createElement('div');
        toast.className = `party-toast ${type}`.trim();
        toast.textContent = message;
        zone.appendChild(toast);

        window.setTimeout(() => toast.remove(), 3200);
    }

    function pulseElement(element) {
        if (!element || prefersReducedMotion()) return;
        element.classList.remove('party-pulse-once');
        void element.offsetWidth;
        element.classList.add('party-pulse-once');
        window.setTimeout(() => element.classList.remove('party-pulse-once'), 650);
    }

    function confetti(amount = 42) {
        ensureLayers();
        if (prefersReducedMotion()) return;

        const layer = $('party-confetti-layer');
        if (!layer) return;

        const colors = ['#8B5CF6', '#EC4899', '#FACC15', '#22C55E', '#38BDF8', '#F97316'];
        const pieces = Math.min(Math.max(amount, 18), 64);

        for (let i = 0; i < pieces; i += 1) {
            const piece = document.createElement('span');
            piece.className = 'party-confetti-piece';
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.background = colors[i % colors.length];
            piece.style.setProperty('--fall-x', `${(Math.random() - .5) * 220}px`);
            piece.style.setProperty('--fall-rotate', `${180 + Math.random() * 720}deg`);
            piece.style.setProperty('--fall-duration', `${900 + Math.random() * 900}ms`);
            layer.appendChild(piece);
            window.setTimeout(() => piece.remove(), 1900);
        }
    }

    function textOf(element) {
        return (element?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getRoundSignature() {
        return [textOf($('p-round')), textOf($('rr-year')), textOf($('rr-answers')), textOf($('rr-board'))].join('|');
    }

    function getBoardRows() {
        return Array.from($('rr-board')?.children || []).filter((row) => textOf(row));
    }

    function parseScore(rowText) {
        const matches = rowText.match(/\d+/g);
        if (!matches?.length) return null;
        return Number(matches[matches.length - 1]);
    }

    function parseLeaderName(rowText) {
        return rowText
            .replace(/^[#🥇🥈🥉🏆\s\d.\-]+/, '')
            .replace(/\d+\s*(pts?|puntos?)?.*$/i, '')
            .trim()
            .slice(0, 28);
    }

    function announceRoundResult() {
        if (activeScreenId() !== 'screen-round-result') return;

        const signature = getRoundSignature();
        if (!signature || signature === partyState.lastRoundSignature) return;
        partyState.lastRoundSignature = signature;

        const actualYear = textOf($('rr-year'));
        const answersText = textOf($('rr-answers'));
        const boardRows = getBoardRows();

        if (actualYear && answersText.includes(actualYear)) {
            showRoundEvent(`🎯 ¡Año exacto! ${actualYear}`, 'success');
            confetti(46);
            pulseElement($('screen-round-result')?.querySelector('.glass'));
        } else if (boardRows.length) {
            showRoundEvent('📊 Ronda cerrada: mira cómo cambia la clasificación', 'info');
        }

        const scoredRows = boardRows
            .map((row) => ({ row, text: textOf(row), score: parseScore(textOf(row)) }))
            .filter((entry) => Number.isFinite(entry.score));

        if (scoredRows.length >= 2 && scoredRows[0].score === scoredRows[1].score) {
            showRoundEvent('⚔️ ¡Empate en cabeza!', 'warning');
            pulseElement($('rr-board'));
        }

        if (scoredRows.length) {
            const currentLeader = parseLeaderName(scoredRows[0].text);
            if (currentLeader && partyState.lastLeader && currentLeader !== partyState.lastLeader) {
                showRoundEvent(`👑 Nuevo líder: ${currentLeader}`, 'leader');
                confetti(28);
                pulseElement(scoredRows[0].row);
            }
            if (currentLeader) partyState.lastLeader = currentLeader;
        }
    }

    function announceAllAnswered() {
        if (activeScreenId() !== 'screen-playing') return;

        const statusBar = $('status-bar');
        if (!statusBar) return;

        const players = Array.from(statusBar.children).filter((node) => textOf(node));
        if (players.length < 2) return;

        const signature = `${textOf($('p-round'))}|${textOf(statusBar)}`;
        const answered = players.filter((node) => /✓|✔|respond/i.test(textOf(node))).length;

        if (answered === players.length && signature !== partyState.lastAllAnsweredSignature) {
            partyState.lastAllAnsweredSignature = signature;
            showRoundEvent('🚀 ¡Todos han respondido!', 'success');
            pulseElement(statusBar);
        }
    }

    function monitorTimer() {
        const timer = $('t-num');
        const screenPlaying = activeScreenId() === 'screen-playing';
        const seconds = Number(textOf(timer));
        const timerWrap = timer?.closest('.relative');

        if (screenPlaying && Number.isFinite(seconds) && seconds > 0 && seconds <= 5) {
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

    function getCurrentPlayerName() {
        return $('inp-username')?.value?.trim() || 'Jugador';
    }

    function announceSubmit() {
        const year = $('year-range')?.value || textOf($('year-val'));
        showRoundEvent(`⚡ ${getCurrentPlayerName()} ha respondido ${year}`, 'info');
        pulseElement($('answered-block'));
    }

    function patchSubmitAnswer() {
        if (partyState.submitPatched || typeof window.submitAnswer !== 'function') return;

        const originalSubmitAnswer = window.submitAnswer;
        window.submitAnswer = function partySubmitAnswerWrapper(...args) {
            const result = originalSubmitAnswer.apply(this, args);
            window.setTimeout(announceSubmit, 30);
            return result;
        };

        partyState.submitPatched = true;
    }

    function bindFallbackSubmit() {
        if (partyState.fallbackSubmitBound) return;
        const button = $('btn-confirm');
        if (!button) return;

        button.addEventListener('click', () => window.setTimeout(announceSubmit, 60));
        partyState.fallbackSubmitBound = true;
    }

    function attachObservers() {
        const observer = new MutationObserver(() => {
            patchSubmitAnswer();
            bindFallbackSubmit();
            announceAllAnswered();
            announceRoundResult();
        });

        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class'],
            characterData: true,
        });

        window.setInterval(() => {
            patchSubmitAnswer();
            bindFallbackSubmit();
            monitorTimer();
            announceAllAnswered();
            announceRoundResult();
        }, 700);
    }

    onReady(() => {
        injectPartyStyles();
        ensureLayers();
        attachObservers();
        window.showRoundEvent = showRoundEvent;
        window.confetti = confetti;
    });
}());
