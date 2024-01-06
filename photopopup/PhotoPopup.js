var modal = document.getElementById("myModal");
var modalImg = document.getElementById("img01");
var captionText = document.getElementById("caption");
var imageLinks = document.querySelectorAll('.image-link');
var currentIndex;

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

document.querySelector('.prev').addEventListener('click', () => {
  if (currentIndex > 0) {
    openModalImage(currentIndex - 1);
  }
});

document.querySelector('.next').addEventListener('click', () => {
  if (currentIndex < imageLinks.length - 1) {
    openModalImage(currentIndex + 1);
  }
});

document.querySelector('.close').addEventListener('click', () => {
  modal.style.display = "none";
});
