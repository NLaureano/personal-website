// Scroll detection for header
let lastScrollTop = 0;
const header = document.querySelector('header');

window.addEventListener('scroll', () => {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop > lastScrollTop && scrollTop > 100) {
        // Scrolling down & past 100px
        header.classList.add('hidden');
    } else {
        // Scrolling up
        header.classList.remove('hidden');
    }
    
    lastScrollTop = scrollTop;
});