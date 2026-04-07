// ── NAV TOGGLE ──
function toggleMenu() {
  const nav = document.getElementById('navLinks');
  if (nav) nav.classList.toggle('active');
}

// Close nav when clicking outside
document.addEventListener('click', function(e) {
  const nav = document.getElementById('navLinks');
  const hamburger = document.querySelector('.hamburger');
  if (nav && nav.classList.contains('active')) {
    if (!nav.contains(e.target) && !hamburger.contains(e.target)) {
      nav.classList.remove('active');
    }
  }
});

// ── FILTER TABS (merch page) ──
document.addEventListener('DOMContentLoaded', function() {
  const tabs = document.querySelectorAll('.filter-tab');
  const cards = document.querySelectorAll('[data-category]');
  const countEl = document.getElementById('filterCount');

  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const filter = this.dataset.filter;

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      // Filter cards
      let visible = 0;
      cards.forEach(card => {
        const match = filter === 'all' || card.dataset.category === filter;
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });

      if (countEl) {
        countEl.textContent = visible + (visible === 1 ? ' product' : ' products');
      }
    });
  });

  // ── SIZE CHIP SELECT ──
  document.querySelectorAll('.merch-sizes').forEach(group => {
    group.querySelectorAll('.size-chip').forEach(chip => {
      chip.addEventListener('click', function() {
        group.querySelectorAll('.size-chip').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
      });
    });
  });

  // ── NOTIFY FORM ──
  const notifyForm = document.querySelector('.notify-form');
  if (notifyForm) {
    notifyForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const input = this.querySelector('input[type="email"]');
      const btn = this.querySelector('button[type="submit"]');
      if (input && btn) {
        btn.textContent = 'You\'re on the list!';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        input.value = '';
      }
    });
  }

  // ── ADD TO CART FEEDBACK ──
  document.querySelectorAll('.merch-add, .merch-add-lg').forEach(btn => {
    btn.addEventListener('click', function() {
      const original = this.textContent;
      this.textContent = '✓ Added';
      this.style.color = '#00cc66';
      setTimeout(() => {
        this.textContent = original;
        this.style.color = '';
      }, 1800);
    });
  });
});
