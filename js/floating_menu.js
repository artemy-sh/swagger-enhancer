(() => {
  const id = 'swagger-floating-menu';
  if (document.getElementById(id)) return;

  const container = document.createElement('div');
  container.id = id;
  container.className = 'swagger-floating-menu';

  // левая и правая части меню
  const left = document.createElement('div');
  left.className = 'swagger-menu-left';

  const right = document.createElement('div');
  right.className = 'swagger-menu-right';

  container.appendChild(left);
  container.appendChild(right);
  document.body.prepend(container);
})();
