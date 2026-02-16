document.addEventListener('DOMContentLoaded', () => {
    // Sticky Header Logic
    const header = document.querySelector('.site-header');

    if (header) {
        header.addEventListener('mousemove', (e) => {
            const rect = header.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            header.style.backgroundImage = `radial-gradient(120px circle at ${x}px ${y}px, rgba(255, 255, 255, 0.1), transparent 100%)`;
        });
        header.addEventListener('mouseleave', () => {
            header.style.backgroundImage = '';
        });
        window.addEventListener('scroll', () => {
            header.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    // Scroll-in animation
    const animStyle = document.createElement('style');
    animStyle.innerHTML = `.fade-in{opacity:0;transform:translateY(24px);transition:opacity .7s ease-out,transform .7s ease-out}.fade-in.visible{opacity:1!important;transform:translateY(0)!important}`;
    document.head.appendChild(animStyle);

    const fadeObs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const siblings = entry.target.parentElement.querySelectorAll('.fade-in');
                const idx = Array.from(siblings).indexOf(entry.target);
                entry.target.style.transitionDelay = `${idx * 0.1}s`;
                entry.target.classList.add('visible');
                fadeObs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });

    document.querySelectorAll('.service-card, .section-title, .section-desc, .step-item, .pricing-card, .why-card, .stat-card').forEach(el => {
        el.classList.add('fade-in');
        fadeObs.observe(el);
    });

    // Hero: animate in immediately with stagger
    document.querySelectorAll('.hero-content > *').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        el.style.transitionDelay = `${i * 0.15}s`;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            });
        });
    });

    // Mobile Navigation
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');
    const mobileOverlay = document.querySelector('.mobile-nav-overlay');

    // On mobile screens, make the toggle visible and prep the nav
    function initMobile() {
        if (window.innerWidth <= 992) {
            if (mobileToggle) mobileToggle.style.display = 'block';
            if (mobileNav) {
                mobileNav.style.display = 'flex';
                // Keep it off-screen (CSS handles right:-100% and visibility:hidden)
            }
            if (mobileOverlay) {
                mobileOverlay.style.display = 'block';
            }
        } else {
            if (mobileToggle) mobileToggle.style.display = 'none';
            if (mobileNav) {
                mobileNav.style.display = 'none';
                mobileNav.classList.remove('open');
            }
            if (mobileOverlay) {
                mobileOverlay.style.display = 'none';
                mobileOverlay.classList.remove('open');
            }
            document.body.style.overflow = '';
        }
    }

    initMobile();
    window.addEventListener('resize', initMobile);

    function toggleMenu() {
        if (!mobileNav || !mobileOverlay) return;
        const isOpen = mobileNav.classList.toggle('open');
        mobileOverlay.classList.toggle('open');
        if (isOpen) {
            mobileNav.style.visibility = 'visible';
            mobileOverlay.style.visibility = 'visible';
            mobileOverlay.style.opacity = '1';
        } else {
            setTimeout(() => {
                mobileNav.style.visibility = 'hidden';
                mobileOverlay.style.visibility = 'hidden';
                mobileOverlay.style.opacity = '0';
            }, 300);
        }
        document.body.style.overflow = isOpen ? 'hidden' : '';
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', toggleMenu);
        if (mobileOverlay) mobileOverlay.addEventListener('click', toggleMenu);
        if (mobileNav) {
            mobileNav.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', toggleMenu);
            });
        }
    }
});
