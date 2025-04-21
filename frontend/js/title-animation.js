function initializeBannerTitle() {
    const titleElement = document.querySelector('.animated-title');
    if (titleElement) {
        console.log("[Animation] Initializing banner title (CSS handles animation).");
        // No JS needed for the current gradient animation via CSS
    }
}
// Make it globally available for main.js
window.initializeBannerTitle = initializeBannerTitle;