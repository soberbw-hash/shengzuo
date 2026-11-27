const inspectModelCardsLayout = (window) =>
  window.webContents.executeJavaScript(`(() => {
    const tolerance = 2;
    const requiredFacts = ['适合', '电脑需要', '占用空间', '语言'];
    const list = document.querySelector('.models-page .model-list');
    const cards = [...document.querySelectorAll('.models-page .model-card')]
      .filter((card) => {
        const rect = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });

    if (!(list instanceof HTMLElement) || cards.length === 0) {
      return {
        ready: false,
        reason: 'missing-model-list-or-cards',
        cardCount: cards.length,
      };
    }

    const listRect = list.getBoundingClientRect();
    const maximumCardHeight = Math.min(440, innerHeight * 0.56);
    const details = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      const title = card.querySelector('h3')?.textContent?.trim() || '';
      const factLabels = [...card.querySelectorAll('.model-facts > div > span')]
        .map((label) => label.textContent?.trim() || '');
      const facts = [...card.querySelectorAll('.model-facts > div')];
      const license = card.querySelector('.model-license-button');
      const licenseRect = license?.getBoundingClientRect();
      const action = card.querySelector('.model-card__actions button');
      const actionRect = action?.getBoundingClientRect();
      return {
        title,
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        factLabels,
        hasAllFacts:
          facts.length === requiredFacts.length &&
          requiredFacts.every((label) => factLabels.includes(label)) &&
          facts.every((fact) => Boolean(fact.querySelector('strong')?.textContent?.trim())),
        licenseComplete:
          license instanceof HTMLButtonElement &&
          license.textContent?.trim() === '查看模型许可证' &&
          Boolean(licenseRect) &&
          licenseRect.width > 0 &&
          licenseRect.height > 0 &&
          licenseRect.top >= rect.top - tolerance &&
          licenseRect.bottom <= rect.bottom + tolerance,
        actionComplete:
          action instanceof HTMLButtonElement &&
          Boolean(action.textContent?.trim()) &&
          Boolean(actionRect) &&
          actionRect.width > 0 &&
          actionRect.height > 0 &&
          actionRect.left >= rect.left - tolerance &&
          actionRect.right <= rect.right + tolerance,
        noInternalOverflow:
          card.scrollWidth <= card.clientWidth + tolerance &&
          card.scrollHeight <= card.clientHeight + tolerance,
      };
    });

    const heights = details.map((card) => card.rect.height);
    const rowHeightsMatch = details.every((card) =>
      details.filter(other => Math.abs(card.rect.top - other.rect.top) <= tolerance)
        .every(other => Math.abs(card.rect.height - other.rect.height) <= tolerance));
    const requiredModels = ["VoxCPM2", "Fun-CosyVoice3 0.5B 2512", "IndexTTS-2.5", "Qwen3-TTS 1.7B Base", "ZONOS3-Mini"];
    const maximumHeight = Math.max(...heights);
    const minimumHeight = Math.min(...heights);
    const lowestBottom = Math.max(...details.map((card) => card.rect.bottom));
    const bottomGap = innerHeight - lowestBottom;
    const checks = {
      completeCatalog: cards.length === requiredModels.length && requiredModels.every(name => details.some(card => card.title === name)),
      listFitsViewport:
        listRect.left >= -tolerance &&
        listRect.right <= innerWidth + tolerance &&
        listRect.top >= -tolerance &&
        listRect.bottom <= innerHeight + tolerance,
      allCardsReachableInsideList:
        list.scrollWidth <= list.clientWidth + tolerance &&
        (lowestBottom <= listRect.bottom + tolerance || getComputedStyle(list).overflowY === 'auto') &&
        details.every(
        (card) =>
          card.rect.left >= -tolerance &&
          card.rect.right <= innerWidth + tolerance &&
          card.rect.top >= listRect.top - tolerance &&
          card.rect.bottom <= listRect.top + list.scrollHeight + tolerance,
      ),
      cardsHaveEqualHeightWithinRow: rowHeightsMatch,
      cardsStayCompact: maximumHeight <= maximumCardHeight + tolerance,
      contentComplete: details.every(
        (card) =>
          Boolean(card.title) &&
          card.hasAllFacts &&
          card.actionComplete &&
          card.noInternalOverflow,
      ),
      licensesComplete: details.every((card) => card.licenseComplete),
    };

    return {
      ready: Object.values(checks).every(Boolean),
      checks,
      viewport: { width: innerWidth, height: innerHeight },
      limits: { maximumCardHeight },
      measurements: {
        cardCount: cards.length,
        maximumHeight,
        minimumHeight,
        heightSpread: maximumHeight - minimumHeight,
        bottomGap,
        list: {
          top: listRect.top,
          bottom: listRect.bottom,
          height: listRect.height,
        },
      },
      cards: details,
    };
  })()`);

module.exports = {
  inspectModelCardsLayout,
};
