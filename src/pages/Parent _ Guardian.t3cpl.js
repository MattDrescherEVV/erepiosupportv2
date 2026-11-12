// Parent / Guardian page
// The Jump Point (#box64) is pinned to the screen. This page opens with a
// full-width hero (#section2), so the Jump Point stays hidden until the hero
// has scrolled out of view, then fades in.

import wixWindowFrontend from 'wix-window-frontend';

const FADE = { duration: 200 };

$w.onReady(async function () {
    const jump = $w('#box64');
    const hero = $w('#section2');

    hero.onViewportEnter(() => jump.hide('fade', FADE));
    hero.onViewportLeave(() => jump.show('fade', FADE));

    // Page opened already scrolled past the hero (e.g. from an anchor link).
    try {
        const { scroll } = await wixWindowFrontend.getBoundingRect();
        if (scroll.y > 400) jump.show();
    } catch (e) {
        jump.show();
    }
});
