document.addEventListener('DOMContentLoaded', function() {
    var startX, startY;

    function handleTouchStart(event) {
        startX = event.touches[0].pageX;
        startY = event.touches[0].pageY;
    }

    function handleTouchMove(event) {
        if (!startX || !startY) {
            return;
        }

        var currentX = event.touches[0].pageX;
        var currentY = event.touches[0].pageY;

        var diffX = startX - currentX;
        var diffY = startY - currentY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) {
                navigateToNextSlide(); // Swipe left
            } else {
                navigateToPreviousSlide(); // Swipe right
            }
        }
        startX = null;
        startY = null;
    }

    function handleTap(event) {
        var tapX = event.clientX;
        var screenWidth = window.innerWidth;

        if (tapX < screenWidth / 2) {
            navigateToPreviousSlide(); // Tap on left side
        } else {
            navigateToNextSlide(); // Tap on right side
        }
    }

    // Adding event listeners
    document.addEventListener('touchstart', handleTouchStart, false);
    document.addEventListener('touchmove', handleTouchMove, false);
    document.addEventListener('click', handleTap, false);
});
