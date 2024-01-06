document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded and parsed, script running");

    var modal = document.getElementById("myModal");
    var modalImg = document.getElementById("img01");
    var captionText = document.getElementById("caption");
    var imageLinks = document.querySelectorAll('.image-link');
    var currentIndex;
    var prevButton = document.querySelector('.prev');
    var nextButton = document.querySelector('.next');
    var closeButton = document.querySelector('.close');

    function openModalImage(index) {
        console.log("Opening modal for image index: ", index);
        modal.style.display = "block";
        modalImg.src = imageLinks[index].href;
        captionText.innerHTML = imageLinks[index].alt;
        currentIndex = index;
    }

    if (imageLinks.length > 0) {
        imageLinks.forEach((item, index) => {
            item.addEventListener('click', event => {
                event.preventDefault();
                console.log("Image link clicked: ", index);
                openModalImage(index);
            });
        });
    } else {
        console.log("No image links found");
    }

    if (prevButton) {
        prevButton.addEventListener('click', () => {
            console.log("Previous button clicked");
            if (currentIndex > 0) {
                openModalImage(currentIndex - 1);
            }
        });
    } else {
        console.log("Previous button not found");
    }

    if (nextButton) {
        nextButton.addEventListener('click', () => {
            console.log("Next button clicked");
            if (currentIndex < imageLinks.length - 1) {
                openModalImage(currentIndex + 1);
            }
        });
    } else {
        console.log("Next button not found");
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            console.log("Close button clicked");
            modal.style.display = "none";
        });
    } else {
        console.log("Close button not found");
    }
});
