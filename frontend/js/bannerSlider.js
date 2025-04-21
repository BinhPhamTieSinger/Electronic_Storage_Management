// js/bannerSlider.js

function initializeBannerSlider() {
    const bannerContainer = document.querySelector('.banner-container');
    if (!bannerContainer) return;

    const slides = bannerContainer.querySelectorAll('.banner-slide');
    if (slides.length <= 1) return; // No need to slide if only one or zero slides

    let currentSlideIndex = 0;
    const slideInterval = 5000; // Time between slides in milliseconds (5 seconds)

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.remove('active');
            if (i === index) {
                slide.classList.add('active');
            }
        });
    }

    function nextSlide() {
        currentSlideIndex = (currentSlideIndex + 1) % slides.length;
        showSlide(currentSlideIndex);
    }

    // Initial setup
    showSlide(currentSlideIndex);

    // Start sliding
    setInterval(nextSlide, slideInterval);
}

// Called from main.js on DOMContentLoaded