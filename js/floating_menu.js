(() => {
  'use strict';

  // Check if this is actually a Swagger UI page
  const checkSwaggerUI = () => {
    // Check for Swagger UI element
    if (document.querySelector('.swagger-ui')) {
      return true;
    }
    // Also check for common Swagger UI indicators
    if (document.querySelector('[data-testid="swagger-ui"]') || 
        document.querySelector('#swagger-ui') ||
        document.querySelector('.swagger-container')) {
      return true;
    }
    return false;
  };

  const createMenu = () => {
    const id = 'swagger-floating-menu';
    if (document.getElementById(id)) return;

    const container = document.createElement('div');
    container.id = id;
    container.className = 'swagger-floating-menu';

    const left = document.createElement('div');
    left.className = 'swagger-menu-left';

    const right = document.createElement('div');
    right.className = 'swagger-menu-right';

    container.appendChild(left);
    container.appendChild(right);
    document.body.prepend(container);
    
    // Add class to body for CSS compatibility
    document.body.classList.add('swagger-enhancer-active');
  };

  // Don't create menu if Swagger UI is not present
  if (!checkSwaggerUI()) {
    // Wait a bit for Swagger UI to load asynchronously
    setTimeout(() => {
      if (!checkSwaggerUI()) {
        return; // Still no Swagger UI, don't create menu
      }
      createMenu();
    }, 1000);
    return;
  }

  createMenu();
})();
