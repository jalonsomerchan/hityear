/*
 * Autoplay para modo 1 jugador y reto diario.
 * Intenta reproducir automáticamente cada ronda pulsando el reproductor en cuanto aparece.
 * Si el navegador bloquea autoplay, el botón manual sigue funcionando.
 */
(function initSoloDailyAutoplay() {
    const AUTOPLAY_DELAY = 80;
    let lastRoundKey = '';

    function activeSoloDailyScreen() {
        const screen = document.getElementById('screen-solo-daily-fixed');
        return Boolean(screen && screen.classList.contains('active'));
    }

    function currentRoundKey() {
        const screen = document.getElementById('screen-solo-daily-fixed');
        const content = document.getElementById('sd-content');
        const roundText = content?.querySelector('.uppercase')?.textContent || '';
        const yearValue = document.getElementById('sd-year-value')?.textContent || '';
        return `${screen?.className || ''}|${roundText}|${yearValue}`;
    }

    function tryAutoplay() {
        if (!activeSoloDailyScreen()) return;

        const playButton = document.getElementById('sd-play');
        const answerButton = document.getElementById('sd-answer');
        if (!playButton || !answerButton) return;

        const key = currentRoundKey();
        if (!key || key === lastRoundKey) return;
        lastRoundKey = key;

        window.setTimeout(() => {
            const freshPlayButton = document.getElementById('sd-play');
            const freshAnswerButton = document.getElementById('sd-answer');
            if (!activeSoloDailyScreen() || !freshPlayButton || !freshAnswerButton) return;
            if (freshPlayButton.textContent.trim() === '⏸') return;
            freshPlayButton.click();
        }, AUTOPLAY_DELAY);
    }

    function install() {
        const observer = new MutationObserver(tryAutoplay);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest('#btn-solo-player, #btn-daily-challenge, #sd-solo-start, #sd-next, #sd-again')) {
                window.setTimeout(tryAutoplay, AUTOPLAY_DELAY);
                window.setTimeout(tryAutoplay, 450);
                window.setTimeout(tryAutoplay, 1200);
            }
        }, true);

        window.setInterval(tryAutoplay, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
}());
