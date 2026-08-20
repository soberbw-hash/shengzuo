const normalizeText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const buildTextLayoutAuditExpression = (
  scenarioName,
  { checkFontPolicy = true } = {},
) => `(() => {
  const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
  const tolerance = 2;
  const viewport = { width: innerWidth, height: innerHeight };
  const failures = [];

  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest('[aria-hidden="true"], [hidden], .sr-only')) return false;
    const style = getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) <= 0.01
    ) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0.5 &&
      rect.height > 0.5 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < innerWidth &&
      rect.top < innerHeight
    );
  };

  const selectorFor = (element) => {
    if (element.id) return '#' + CSS.escape(element.id);
    const parts = [];
    let current = element;
    for (let depth = 0; current && depth < 4; depth += 1) {
      let part = current.tagName.toLowerCase();
      const usefulClasses = [...current.classList]
        .filter((name) => !name.startsWith('text-') && !name.startsWith('mt-') && !name.startsWith('gap-'))
        .slice(0, 2);
      if (usefulClasses.length > 0) {
        part += usefulClasses.map((name) => '.' + CSS.escape(name)).join('');
      } else if (current.parentElement) {
        const siblings = [...current.parentElement.children].filter(
          (item) => item.tagName === current.tagName,
        );
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      if (current.matches('main, [role="dialog"], .toast-card, .model-card, .glass-card')) break;
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  const directTextNodes = (element) =>
    [...element.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && normalize(node.textContent).length > 0,
    );

  const textRectsFor = (element) => {
    const nodes = directTextNodes(element);
    const targets = nodes.length > 0 ? nodes : [element];
    const rects = [];
    for (const target of targets) {
      const range = document.createRange();
      try {
        if (target === element) range.selectNodeContents(element);
        else range.selectNode(target);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0.25 && rect.height > 0.25) rects.push(rect);
        }
      } finally {
        range.detach();
      }
    }
    return rects;
  };

  const clippingRectFor = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left + element.clientLeft,
      top: rect.top + element.clientTop,
      right: rect.left + element.clientLeft + element.clientWidth,
      bottom: rect.top + element.clientTop + element.clientHeight,
    };
  };

  const rectOutside = (child, parent) => ({
    left: child.left < parent.left - tolerance,
    right: child.right > parent.right + tolerance,
    top: child.top < parent.top - tolerance,
    bottom: child.bottom > parent.bottom + tolerance,
  });

  const isClippingValue = (value) => value === 'hidden' || value === 'clip';
  const isScrollableValue = (value) => value === 'auto' || value === 'scroll';

  const disclosureFor = (element, fullText) => {
    let current = element;
    for (let depth = 0; current && depth < 4; depth += 1) {
      for (const value of [current.getAttribute('title'), current.getAttribute('aria-label')]) {
        const disclosure = normalize(value);
        if (disclosure && disclosure.includes(fullText)) return disclosure;
        if (
          disclosure &&
          fullText.endsWith('…') &&
          disclosure.startsWith(fullText.slice(0, -1))
        ) return disclosure;
      }
      current = current.parentElement;
    }
    return '';
  };

  const hasScrollableClipAncestor = (element, textRects) => {
    let current = element.parentElement;
    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      if (isScrollableValue(style.overflowX) || isScrollableValue(style.overflowY)) {
        const clip = clippingRectFor(current);
        if (textRects.some((rect) => {
          const outside = rectOutside(rect, clip);
          return outside.left || outside.right || outside.top || outside.bottom;
        })) return true;
      }
      current = current.parentElement;
    }
    return false;
  };

  const addFailure = (element, kind, details) => {
    if (failures.length >= 40) return;
    const text = normalize(element.textContent).slice(0, 160);
    const rect = element.getBoundingClientRect();
    failures.push({
      kind,
      selector: selectorFor(element),
      text,
      details,
      rect: {
        left: Math.round(rect.left * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      },
    });
  };

  const fontFacePolicies = [];
  const visitCssRules = (rules) => {
    for (const rule of rules || []) {
      if (rule instanceof CSSFontFaceRule) {
        const family = normalize(rule.style.getPropertyValue('font-family')).replace(/["']/g, '');
        if (family.includes('Shengzuo HarmonyOS Sans')) {
          fontFacePolicies.push({
            family,
            display: normalize(rule.style.getPropertyValue('font-display')).toLowerCase(),
          });
        }
      } else if ('cssRules' in rule) {
        try {
          visitCssRules(rule.cssRules);
        } catch {
          // Cross-origin rules are irrelevant to the bundled local font.
        }
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visitCssRules(sheet.cssRules);
    } catch {
      // Cross-origin rules are irrelevant to the bundled local font.
    }
  }
  const harmonyPreload = [...document.querySelectorAll('link[rel="preload"][as="font"]')]
    .find((link) => (link.getAttribute('href') || '').includes('HarmonyOS_Sans_SC'));
  const shouldCheckFontPolicy = ${JSON.stringify(checkFontPolicy)};
  if (
    shouldCheckFontPolicy &&
    (
      fontFacePolicies.length === 0 ||
      fontFacePolicies.some((policy) => !['block', 'optional'].includes(policy.display))
    )
  ) {
    addFailure(document.documentElement, 'font-loading-can-cause-late-reflow', {
      fontFacePolicies,
      hasHarmonyFontPreload: harmonyPreload instanceof HTMLLinkElement,
    });
  }

  const directTextElements = [...document.querySelectorAll('body *')].filter((element) => {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
    if (element.matches('script, style, textarea, input, option, svg, path')) return false;
    if (element.closest('textarea, input, svg')) return false;
    return directTextNodes(element).length > 0;
  });

  for (const element of directTextElements) {
    const fullText = normalize(element.textContent);
    if (!fullText) continue;
    const textRects = textRectsFor(element);
    if (textRects.length === 0 || hasScrollableClipAncestor(element, textRects)) continue;
    const ownStyle = getComputedStyle(element);
    const ownClip = clippingRectFor(element);
    const ownOverflow = textRects.reduce(
      (result, rect) => {
        const outside = rectOutside(rect, ownClip);
        return {
          left: result.left || outside.left,
          right: result.right || outside.right,
          top: result.top || outside.top,
          bottom: result.bottom || outside.bottom,
        };
      },
      { left: false, right: false, top: false, bottom: false },
    );

    const ellipsized =
      ownStyle.textOverflow === 'ellipsis' ||
      Number.parseInt(ownStyle.webkitLineClamp || '0', 10) > 0;
    const ownHorizontalRange = element.scrollWidth - element.clientWidth;
    const ownVerticalRange = element.scrollHeight - element.clientHeight;
    const ownClipsX = isClippingValue(ownStyle.overflowX);
    const ownClipsY = isClippingValue(ownStyle.overflowY);
    const clippedByOwnBox =
      (ownClipsX && (ownOverflow.left || ownOverflow.right || ownHorizontalRange > tolerance)) ||
      (ownClipsY && (ownOverflow.top || ownOverflow.bottom || ownVerticalRange > tolerance));

    if (ellipsized && (clippedByOwnBox || ownHorizontalRange > tolerance || ownVerticalRange > tolerance)) {
      if (!disclosureFor(element, fullText)) {
        addFailure(element, 'ellipsis-without-full-label', {
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        });
      }
      continue;
    }

    if (
      ownVerticalRange > tolerance &&
      !isScrollableValue(ownStyle.overflowY)
    ) {
      addFailure(element, 'multiline-text-does-not-fit-fixed-height', {
        overflowY: ownStyle.overflowY,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
      continue;
    }

    if (clippedByOwnBox) {
      addFailure(element, 'text-clipped-by-own-box', {
        overflow: ownOverflow,
        overflowX: ownStyle.overflowX,
        overflowY: ownStyle.overflowY,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      });
      continue;
    }

    let ancestor = element.parentElement;
    while (ancestor && ancestor !== document.body) {
      const style = getComputedStyle(ancestor);
      if (isClippingValue(style.overflowX) || isClippingValue(style.overflowY)) {
        const clip = clippingRectFor(ancestor);
        const overflow = textRects.reduce(
          (result, rect) => {
            const outside = rectOutside(rect, clip);
            return {
              left: result.left || outside.left,
              right: result.right || outside.right,
              top: result.top || outside.top,
              bottom: result.bottom || outside.bottom,
            };
          },
          { left: false, right: false, top: false, bottom: false },
        );
        if (
          (isClippingValue(style.overflowX) && (overflow.left || overflow.right)) ||
          (isClippingValue(style.overflowY) && (overflow.top || overflow.bottom))
        ) {
          addFailure(element, 'text-clipped-by-ancestor', {
            ancestor: selectorFor(ancestor),
            ancestorOverflowX: style.overflowX,
            ancestorOverflowY: style.overflowY,
            overflow,
          });
          break;
        }
      }
      ancestor = ancestor.parentElement;
    }
  }

  const selectElements = [...document.querySelectorAll('select')].filter(isVisible);
  for (const select of selectElements) {
    const selectedText = normalize(select.selectedOptions[0]?.textContent);
    if (!selectedText) continue;
    const style = getComputedStyle(select);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;
    context.font = style.font;
    const textWidth = context.measureText(selectedText).width;
    const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    // SelectField reserves the custom chevron inside padding-right, so the
    // remaining content box is the real space available to the selected text.
    const available = select.clientWidth - horizontalPadding;
    if (textWidth > available + tolerance && !disclosureFor(select, selectedText)) {
      addFailure(select, 'select-value-clipped-without-full-label', {
        selectedText,
        measuredTextWidth: Math.round(textWidth * 10) / 10,
        availableWidth: Math.round(available * 10) / 10,
      });
    }
  }

  const compactTextareas = [...document.querySelectorAll('.voice-design-card textarea')]
    .filter(isVisible);
  for (const textarea of compactTextareas) {
    const style = getComputedStyle(textarea);
    const content = normalize(textarea.value || textarea.placeholder);
    if (
      content &&
      style.resize === 'none' &&
      textarea.scrollHeight - textarea.clientHeight > tolerance
    ) {
      addFailure(textarea, 'fixed-height-textarea-clips-wrapped-text', {
        source: textarea.value ? 'value' : 'placeholder',
        characters: content.length,
        scrollHeight: textarea.scrollHeight,
        clientHeight: textarea.clientHeight,
        resize: style.resize,
      });
    }
  }

  const coverage = {
    buttons: [...document.querySelectorAll('button, [role="button"]')].filter(isVisible).length,
    headings: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(isVisible).length,
    descriptions: [...document.querySelectorAll('p, small')].filter(isVisible).length,
    selects: selectElements.length,
    modelCards: [...document.querySelectorAll('.model-card')].filter(isVisible).length,
    tooltips: [...document.querySelectorAll('[role="tooltip"], .generation-mode-help__tooltip')].filter(isVisible).length,
    modals: [...document.querySelectorAll('[role="dialog"]')].filter(isVisible).length,
    toasts: [...document.querySelectorAll('.toast-card')].filter(isVisible).length,
  };

  return {
    ready: failures.length === 0,
    scenario: ${JSON.stringify(normalizeText(scenarioName))},
    viewport,
    checkedTextElements: directTextElements.length,
    checkedSelectElements: selectElements.length,
    checkedCompactTextareas: compactTextareas.length,
    fontPolicy: {
      faces: fontFacePolicies,
      hasPreload: harmonyPreload instanceof HTMLLinkElement,
    },
    coverage,
    failures,
  };
})()`;

const inspectTextLayout = (window, scenarioName, options) =>
  window.webContents.executeJavaScript(
    buildTextLayoutAuditExpression(scenarioName, options),
  );

module.exports = {
  inspectTextLayout,
};
