document.addEventListener('DOMContentLoaded', function() {
    let touchstartX = 0;
    let touchendX = 0;
    
    function checkDirection() {
        if (touchendX < touchstartX) navigateToNextSlide();
        if (touchendX > touchstartX) navigateToPreviousSlide();
    }

    document.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
    });

    document.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        checkDirection();
    });

    document.addEventListener('click', e => {
        // Assuming the whole window width is divided into two for navigation
        if (e.clientX < window.innerWidth / 2) {
            navigateToPreviousSlide();
        } else {
            navigateToNextSlide();
        }
    });
});

function navigateToNextSlide() {
    // Logic to navigate to the next slide
    // Replace with your actual function call
}

function navigateToPreviousSlide() {
    // Logic to navigate to the previous slide
    // Replace with your actual function call
}
