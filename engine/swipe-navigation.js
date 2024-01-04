document.addEventListener('DOMContentLoaded', function() {
    let startX, startY;

    function handleGesture() {
        if (startX === null || startY === null) {
            return;
        }

        const xDiff = startX - endX;
        const yDiff = startY - endY;

        if (Math.abs(xDiff) > Math.abs(yDiff)) { // Horizontal swipe
            if (xDiff > 0) {
                // Swipe left - next slide
                document.querySelector('.navigate-right').click();
            } else {
                // Swipe right - previous slide
                document.querySelector('.navigate-left').click();
            }
        } else { // Vertical swipe
            if (yDiff > 0) {
                // Swipe up - below slide
                document.querySelector('.navigate-down').click();
            } else {
                // Swipe down - above slide
                document.querySelector('.navigate-up').click();
            }
        }

        // Reset values
        startX = null;
        startY = null;
    }

    document.addEventListener('touchstart', e => {
        startX = e.changedTouches[0].screenX;
        startY = e.changedTouches[0].screenY;
    });

    document.addEventListener('touchend', e => {
        endX = e.changedTouches[0].screenX;
        endY = e.changedTouches[0].screenY;
        handleGesture();
    });

    document.addEventListener('click', e => {
        // Assuming the whole window width is divided into two for navigation
        if (e.clientX < window.innerWidth / 2) {
            document.querySelector('.navigate-left').click(); // Tap on left side
        } else {
            document.querySelector('.navigate-right').click(); // Tap on right side
        }
    });
});
