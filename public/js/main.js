document.addEventListener('DOMContentLoaded', () => {
  const alertCloseBtns = document.querySelectorAll('.alert-close');
  alertCloseBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const alertBox = e.target.closest('.alert');
      if (alertBox) {
        alertBox.style.opacity = '0';
        setTimeout(() => alertBox.remove(), 200);
      }
    });
  });
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId.length > 1) {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
});
