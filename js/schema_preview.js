/** On-demand, local previews of schemas already present in Swagger's specification. */
(() => {
  'use strict';
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  class SchemaPreviewFeature extends window.SwaggerEnhancerUtils.features.BaseFeature {
    constructor() {
      super('schemaPreviewEnabled', 'css/schema_preview.css', { messageType: 'TOGGLE_SCHEMA_PREVIEW' });
      this.sequence = 0;
    }
    inspect(href) {
      const id = `schema-preview-${++this.sequence}`;
      let result;
      const receive = event => {
        try { const data = JSON.parse(event.detail); if (data.id === id && typeof data.name === 'string' && data.schema !== undefined) result = data; }
        catch { /* Unsupported page response. */ }
      };
      document.addEventListener('swagger-enhancer:schema-details', receive);
      try { document.dispatchEvent(new CustomEvent('swagger-enhancer:schema-inspect', { detail: JSON.stringify({ id, href }) })); }
      finally { document.removeEventListener('swagger-enhancer:schema-details', receive); }
      return result;
    }
    onEnable() {
      this.clickHandler = event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || this.panel?.contains(link) || link.hasAttribute('download')) return;
        const target = link.getAttribute('target') || document.querySelector('base[target]')?.getAttribute('target');
        // Swagger's Markdown renderer sets target=_blank even on local schema links.
        // The opt-in preview handles an ordinary click, modifiers still open a tab.
        if (target && !['_self', '_top', '_parent', '_blank'].includes(target)) return;
        const data = this.inspect(link.href);
        if (!data) return;
        event.preventDefault(); event.stopPropagation();
        this.open(link, data, link.href, event.detail === 0);
      };
      this.outsideHandler = event => {
        if (this.panel && !this.panel.contains(event.target) && !this.anchor?.contains(event.target)) this.close(false);
      };
      this.keyHandler = event => {
        if (event.key === 'Escape' && this.panel) { event.preventDefault(); event.stopPropagation(); this.close(true); }
      };
      this.positionHandler = event => {
        if (this.panel) this.position();
      };
      document.addEventListener('click', this.clickHandler, true);
      document.addEventListener('pointerdown', this.outsideHandler, true);
      document.addEventListener('keydown', this.keyHandler, true);
      window.addEventListener('resize', this.positionHandler);
      window.addEventListener('scroll', this.positionHandler, true);
    }
    onDisable() {
      document.removeEventListener('click', this.clickHandler, true);
      document.removeEventListener('pointerdown', this.outsideHandler, true);
      document.removeEventListener('keydown', this.keyHandler, true);
      window.removeEventListener('resize', this.positionHandler);
      window.removeEventListener('scroll', this.positionHandler, true);
      this.close(false);
    }
    onSpecChanged() {
      this.close(false);
    }
    close(restore) {
      clearTimeout(this.closeTimer);
      this.panel?.remove(); this.panel = null;
      if (restore && this.anchor?.isConnected) this.anchor.focus({ preventScroll: true });
      this.anchor = null; this.history = []; this.current = null;
    }
    open(anchor, data, href, keyboard) {
      this.close(false);
      this.anchor = anchor;
      this.history = [];
      this.panel = make('section', 'swagger-schema-preview');
      this.panel.id = 'swagger-schema-preview';
      this.panel.setAttribute('role', 'dialog');
      this.panel.setAttribute('aria-modal', 'false');
      this.panel.setAttribute('aria-labelledby', 'swagger-schema-preview-title');
      document.body.append(this.panel);
      this.render(data, href);
      if (keyboard) this.panel.querySelector('.swagger-schema-preview-close').focus({ preventScroll: true });
    }
    reference(ref) {
      if (typeof ref !== 'string' || !/^#\/(components\/schemas|definitions)\//.test(ref)) return null;
      return new URL(ref, location.href).href;
    }
    type(schema) {
      if (schema === true) return 'any';
      if (schema === false) return 'never';
      if (!schema || typeof schema !== 'object') return 'any';
      if (schema.$ref) {
        try { return decodeURIComponent(schema.$ref.split('/').at(-1)).replace(/~1/g, '/').replace(/~0/g, '~'); }
        catch { return 'reference'; }
      }
      if (schema.type === 'array' || schema.items) return `${this.type(schema.items)}[]`;
      const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type || (schema.properties ? 'object' : schema.enum ? 'enum' : 'object');
      return type + (schema.format ? ` (${schema.format})` : '') + (schema.nullable && !String(type).includes('null') ? ' | null' : '');
    }
    summary(schema, parent) {
      const reference = schema?.$ref || schema?.items?.$ref;
      const href = this.reference(reference);
      if (href) {
        const button = make('button', 'swagger-schema-preview-reference', this.type(schema));
        button.type = 'button';
        button.addEventListener('click', () => {
          const data = this.inspect(href);
          if (!data) return;
          this.history.push(this.current);
          this.render(data, href);
          this.panel.querySelector('.swagger-schema-preview-back')?.focus({ preventScroll: true });
        });
        parent.append(button);
      } else parent.append(make('code', 'swagger-schema-preview-type', this.type(schema)));
    }
    schema(schema, parent, depth = 0) {
      if (depth > 3 || !schema || typeof schema !== 'object') { this.summary(schema, parent); return; }
      if (schema.description) parent.append(make('p', 'swagger-schema-preview-description', String(schema.description)));
      if (schema.$ref) this.summary(schema, parent);
      const properties = schema.properties && typeof schema.properties === 'object' ? Object.entries(schema.properties) : [];
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      for (const [name, property] of properties.slice(0, 100)) {
        const row = make('div', 'swagger-schema-preview-property');
        const heading = make('div', 'swagger-schema-preview-property-heading');
        heading.append(make('code', 'swagger-schema-preview-name', name));
        if (required.has(name)) heading.append(make('span', 'swagger-schema-preview-required', 'required'));
        this.summary(property, heading);
        row.append(heading);
        if (property?.description) row.append(make('p', 'swagger-schema-preview-description', String(property.description)));
        if (Array.isArray(property?.enum)) row.append(make('code', 'swagger-schema-preview-enum', property.enum.slice(0, 10).map(value => JSON.stringify(value)).join(', ') + (property.enum.length > 10 ? ', …' : '')));
        const nested = property?.properties ? property : property?.items?.properties ? property.items : null;
        if (nested && depth < 3) {
          const details = make('details', 'swagger-schema-preview-nested');
          details.append(make('summary', '', 'Properties'));
          let rendered = false;
          details.addEventListener('toggle', () => { if (details.open && !rendered) { rendered = true; this.schema(nested, details, depth + 1); this.position(); } });
          row.append(details);
        }
        parent.append(row);
      }
      if (properties.length > 100) parent.append(make('p', 'swagger-schema-preview-description', `${properties.length - 100} more properties. Open the full schema to see all.`));
      let composed = false;
      for (const [key, label] of [['allOf', 'All of'], ['oneOf', 'One of'], ['anyOf', 'Any of']]) {
        if (!Array.isArray(schema[key])) continue;
        composed = true;
        const group = make('div', 'swagger-schema-preview-composition');
        group.append(make('p', 'swagger-schema-preview-composition-label', label));
        for (const choice of schema[key].slice(0, 20)) {
          const details = make('details', 'swagger-schema-preview-nested');
          details.append(make('summary', '', this.type(choice)));
          let rendered = false;
          details.addEventListener('toggle', () => { if (details.open && !rendered) { rendered = true; this.schema(choice, details, depth + 1); this.position(); } });
          group.append(details);
        }
        parent.append(group);
      }
      if (schema.items) {
        const items = make('div', 'swagger-schema-preview-items');
        items.append(make('p', 'swagger-schema-preview-composition-label', 'Items'));
        this.schema(schema.items, items, depth + 1); parent.append(items);
      }
      if (Array.isArray(schema.enum)) parent.append(make('code', 'swagger-schema-preview-enum', schema.enum.slice(0, 20).map(value => JSON.stringify(value)).join(', ')));
      if (!properties.length && !schema.$ref && !composed && !schema.items && !schema.enum) {
        parent.append(make('p', 'swagger-schema-preview-description', schema.type === 'object' || !schema.type ? 'No properties are defined in the API specification.' : this.type(schema)));
      }
    }
    render(data, href) {
      this.current = { data, href };
      this.panel.replaceChildren();
      const header = make('div', 'swagger-schema-preview-header');
      if (this.history.length) {
        const back = make('button', 'swagger-schema-preview-back', 'Back'); back.type = 'button';
        back.addEventListener('click', () => {
          const previous = this.history.pop(); this.render(previous.data, previous.href);
          // The old Back button was removed by render. Keep keyboard navigation
          // inside the card even when returning to its first schema.
          this.panel.querySelector('.swagger-schema-preview-back, .swagger-schema-preview-close')?.focus({ preventScroll: true });
        });
        header.append(back);
      }
      const title = make('h3', '', data.name); title.title = data.name; title.id = 'swagger-schema-preview-title';
      const close = make('button', 'swagger-schema-preview-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close schema preview');
      close.addEventListener('click', () => this.close(true));
      header.append(title, close);
      const body = make('div', 'swagger-schema-preview-body');
      body.append(make('code', 'swagger-schema-preview-root-type', this.type(data.schema)));
      this.schema(data.schema, body);
      const footer = make('div', 'swagger-schema-preview-footer');
      const full = make('a', '', 'Open in Schemas'); full.href = href;
      full.addEventListener('click', event => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
          event.preventDefault();
          document.dispatchEvent(new CustomEvent('swagger-enhancer:schema-reveal', { detail: JSON.stringify({ href }) }));
          this.close(false);
        }
      });
      footer.append(full);
      this.panel.append(header, body, footer);
      this.position();
    }
    position() {
      if (!this.panel || !this.anchor?.isConnected) { if (this.panel) this.close(false); return; }
      const rect = this.anchor.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) { this.close(false); return; }
      const menuBottom = document.getElementById('swagger-floating-menu')?.getBoundingClientRect().bottom || 0;
      const minTop = Math.max(12, menuBottom + 8);
      const below = Math.max(0, innerHeight - rect.bottom - 20);
      const above = Math.max(0, rect.top - minTop - 8);
      this.panel.style.maxHeight = `${Math.max(140, Math.min(460, Math.max(below, above), innerHeight - minTop - 12))}px`;
      const box = this.panel.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect.left, innerWidth - box.width - 12));
      const placeBelow = below >= box.height || below >= above;
      const top = placeBelow ? rect.bottom + 8 : rect.top - box.height - 8;
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${Math.max(minTop, Math.min(top, innerHeight - box.height - 12))}px`;
    }
  }
  window.SchemaPreviewFeature = SchemaPreviewFeature;
})();
