document.addEventListener('DOMContentLoaded', function() {
    var modal = document.getElementById("myModal");
    var modalImg = document.getElementById("img01");
    var captionText = document.getElementById("caption");
    var imageLinks = document.querySelectorAll('.image-link');
    var currentIndex;
    var prevButton = document.querySelector('.prev');
    var nextButton = document.querySelector('.next');
    var closeButton = document.querySelector('.close');

    function openModalImage(index) {
        modal.style.display = "block";
        modalImg.src = imageLinks[index].href;
        captionText.innerHTML = imageLinks[index].alt;
        currentIndex = index;
    }

    imageLinks.forEach((item, index) => {
        item.addEventListener('click', event => {
            event.preventDefault();
            openModalImage(index);
        });
    });

    if (prevButton) {
        prevButton.addEventListener('click', () => {
            if (currentIndex > 0) {
                openModalImage(currentIndex - 1);
            }
        });
    }

    if (nextButton) {
        nextButton.addEventListener('click', () => {
            if (currentIndex < imageLinks.length - 1) {
                openModalImage(currentIndex + 1);
            }
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', () => {
            modal.style.display = "none";
        });
    }
});
