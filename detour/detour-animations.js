(() => {
  // Fade in elements on scroll
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const fadeInObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeInObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Apply fade-in class to sections
  document.addEventListener('DOMContentLoaded', () => {
    // Add fade-in class to sections
    const sections = document.querySelectorAll('.problem, .solution, .features, .how-it-works, .privacy-section, .support');
    sections.forEach(section => {
      section.classList.add('fade-in');
      fadeInObserver.observe(section);
    });

    // Animate feature cards with stagger
    const features = document.querySelectorAll('.feature');
    features.forEach((feature, index) => {
      feature.style.transitionDelay = `${index * 0.1}s`;
    });

    // Animate steps with stagger
    const steps = document.querySelectorAll('.step');
    steps.forEach((step, index) => {
      step.style.transitionDelay = `${index * 0.15}s`;
    });

    // Add hover effect to demo screens
    const demoScreens = document.querySelectorAll('.demo-screen');
    demoScreens.forEach(screen => {
      screen.addEventListener('mouseenter', () => {
        screen.style.transform = 'translateY(-4px)';
        screen.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.1)';
      });
      
      screen.addEventListener('mouseleave', () => {
        screen.style.transform = 'translateY(0)';
        screen.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.05)';
      });
    });

    // Add smooth scroll behavior
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });

    // Animate redirect arrow
    const redirectArrow = document.querySelector('.redirect-arrow');
    if (redirectArrow) {
      // Add random subtle movements
      setInterval(() => {
        const randomX = (Math.random() - 0.5) * 4;
        const randomY = (Math.random() - 0.5) * 4;
        redirectArrow.style.transform = `translate(${randomX}px, ${randomY}px)`;
      }, 2000);
    }

    // Add parallax effect to hero
    let ticking = false;
    function updateParallax() {
      const scrolled = window.pageYOffset;
      const hero = document.querySelector('.hero-content');
      if (hero && scrolled < window.innerHeight) {
        hero.style.transform = `translateY(${scrolled * 0.3}px)`;
        hero.style.opacity = 1 - (scrolled / window.innerHeight);
      }
      ticking = false;
    }

    function requestTick() {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }

    window.addEventListener('scroll', requestTick);

    // Add transition styles to demo screens
    demoScreens.forEach(screen => {
      screen.style.transition = 'all 0.3s ease';
    });
  });

  // Add loading animation for Chrome Web Store button
  const chromeButton = document.querySelector('.btn-primary');
  if (chromeButton) {
    chromeButton.addEventListener('click', (e) => {
      // Add loading state
      chromeButton.style.pointerEvents = 'none';
      chromeButton.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" width="20" height="20" style="animation: spin 1s linear infinite;">
          <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.364 6.364l-2.828-2.828M8.464 8.464L5.636 5.636m12.728 0l-2.828 2.828m-7.072 7.072l-2.828 2.828"/>
        </svg>
        Opening Chrome Web Store...
      `;
      
      // Reset after navigation (fallback)
      setTimeout(() => {
        chromeButton.style.pointerEvents = 'auto';
        chromeButton.innerHTML = `
          <svg class="btn-icon" viewBox="0 0 24 24" width="20" height="20">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          Add to Chrome
        `;
      }, 3000);
    });
  }

  // Add CSS for spin animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
})();