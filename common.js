// common.js
// Header (topbar) HTML content
document.getElementById('headerPlaceholder').innerHTML = `
    <div class="topbar">
      <div class="top-inner">
        <div class="logo-box">
          <div class="logo-icon">📞</div>
          <div class="logo-text">
            <h2>SecureOS</h2>
            <p>NETBOOT MAPPING PORTAL</p>
          </div>
        </div>
        <button class="hamburger-menu" id="hamburgerMenu" aria-label="Toggle menu">&#9776;</button>
        <nav class="nav-links" id="navLinks">
          <a href="index.html">Home</a>
          <a href="how-to.html">Guide</a>
          <a href="admin.html">Login</a>
        </nav>
      </div>
    </div>
`;

// Footer HTML content
document.getElementById('footerPlaceholder').innerHTML = `
    <div class="simple-footer">© 2026 SecureOS</div>
`;

// Hamburger toggle for mobile nav
const hamburgerMenu = document.getElementById('hamburgerMenu');
const navLinks = document.getElementById('navLinks');
hamburgerMenu.addEventListener('click', () => {
  navLinks.classList.toggle('active');
});